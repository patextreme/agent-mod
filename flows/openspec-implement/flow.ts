import {
  acp,
  action,
  compute,
  decision,
  defineFlow,
  type FlowEdge,
  type FlowNodeContext,
  type FlowNodeDefinition,
} from "acpx/flows";
import { type Command, command } from "../shared/command.js";
import { object } from "../shared/data.js";
import { collectSteering, SteeringError } from "../shared/steering.js";
import {
  type Authorization,
  applyPrompt,
  authorize,
  type Blocker,
  completionSupported,
  judgePrompt,
  parseReport,
  preflight,
  type Report,
  type Snapshot,
  snapshot,
  type Target,
  type Task,
} from "./helpers.js";

export interface ImplementResult {
  changeId: string;
  outcome: "success" | "limit_reached" | "needs_human" | "cancelled" | "failed";
  repairAttempts: number;
  summary: string;
  remaining: {
    tasks: Task[];
    reportedTasks: string[];
    blockers: Blocker[];
  };
}
interface Dependencies {
  cwd?: string;
  command?: Command;
  steering?: typeof collectSteering;
  emit?: (result: ImplementResult) => void;
}
type Classification = "completed" | "repairable_pause" | "escalation_required";
const target = (context: FlowNodeContext) =>
  context.outputs.preflight as Target;
const attempts = (context: FlowNodeContext) =>
  context.state.steps.filter((step) => step.nodeId === "repair").length;
const current = (context: FlowNodeContext) =>
  (context.outputs.refresh ?? context.outputs.snapshot) as Snapshot | undefined;
const authorizations = (context: FlowNodeContext) =>
  (context.outputs.authorize ?? []) as Authorization[];
// Use the last normal dispatch, never a stale repair output from a prior cycle.
function report(context: FlowNodeContext): Report | undefined {
  return context.state.steps
    .filter(
      (step) =>
        (step.nodeId === "apply" || step.nodeId === "repair") &&
        step.outcome === "ok",
    )
    .at(-1)?.output as Report | undefined;
}
function packet(context: FlowNodeContext): Report | undefined {
  // A normal repair starts a new cycle; never reuse earlier escalation output.
  let escalation: { route: string; report: Report } | undefined;
  let assessed: Report | undefined;
  for (const step of context.state.steps) {
    if (step.outcome !== "ok") continue;
    if (step.nodeId === "apply" || step.nodeId === "repair") {
      escalation = undefined;
      assessed = undefined;
    } else if (step.nodeId === "escalation") {
      escalation = step.output as { route: string; report: Report };
      assessed = undefined;
    } else if (step.nodeId === "assessed_packet") {
      assessed = step.output as Report;
    }
  }
  return escalation?.route === "assess" ? assessed : escalation?.report;
}

function requiredSnapshot(context: FlowNodeContext): Snapshot {
  const value = current(context);
  if (!value) throw new Error("Missing current apply snapshot");
  return value;
}
function requiredReport(context: FlowNodeContext): Report {
  const value = report(context);
  if (!value) throw new Error("Missing normal implementation report");
  return value;
}
function requiredPacket(context: FlowNodeContext): Report {
  const value = packet(context);
  if (!value) throw new Error("Missing validated escalation packet");
  return value;
}

export function createImplementFlow(deps: Dependencies = {}) {
  const run = deps.command ?? command;
  const emit =
    deps.emit ??
    ((result: ImplementResult) => {
      process.stdout.write(`${JSON.stringify(result)}\n`);
      process.stderr.write(
        `${result.changeId}: ${result.outcome}, ${result.repairAttempts}/10 repairs — ${result.summary}\n`,
      );
    });
  const finish = (
    outcome: ImplementResult["outcome"],
    summary: string | ((context: FlowNodeContext) => string),
  ) =>
    compute({
      run(context) {
        const latest = report(context);
        const result: ImplementResult = {
          changeId:
            target(context)?.changeId ??
            (context.input &&
            typeof context.input === "object" &&
            "changeId" in context.input
              ? String(context.input.changeId)
              : "unknown"),
          outcome,
          repairAttempts: attempts(context),
          summary: [
            typeof summary === "function" ? summary(context) : summary,
            latest?.summary,
          ]
            .filter(Boolean)
            .join(" "),
          remaining: {
            tasks: current(context)?.tasks.filter((task) => !task.done) ?? [],
            reportedTasks: latest?.remainingTasks ?? [],
            blockers: packet(context)?.blockers ?? latest?.blockers ?? [],
          },
        };
        emit(result);
        return result;
      },
    });
  const fresh = {
    profile: "pi",
    session: { isolated: true },
    cwd: (context: FlowNodeContext) => target(context).cwd,
  };
  const nodes: Record<string, FlowNodeDefinition> = {
    preflight: compute({
      run: (context) =>
        preflight(
          context.input,
          deps.cwd ?? process.cwd(),
          run,
          context.signal,
        ),
    }),
    snapshot: compute({
      run: (context) => snapshot(target(context), run, context.signal),
    }),
    apply: acp({
      ...fresh,
      timeoutMs: 90 * 60 * 1000,
      prompt: (context) =>
        applyPrompt(target(context), requiredSnapshot(context), 0, null, []),
      parse: (raw) => parseReport(raw, 0),
    }),
    repair: acp({
      ...fresh,
      timeoutMs: 90 * 60 * 1000,
      // The active dispatch is not in steps until it returns (or fails).
      prompt: (context) =>
        applyPrompt(
          target(context),
          requiredSnapshot(context),
          attempts(context) + 1,
          report(context) ?? null,
          authorizations(context),
        ),
      parse: (raw, context) => parseReport(raw, attempts(context) + 1),
    }),
    refresh: compute({
      run: (context) => snapshot(target(context), run, context.signal),
    }),
    judge: decision({
      ...fresh,
      choices: ["completed", "repairable_pause", "escalation_required"],
      question: (context) =>
        judgePrompt(
          requiredSnapshot(context),
          requiredReport(context),
          attempts(context),
        ),
    }),
    classification: compute({
      run(context) {
        let route = object(context.outputs.judge).route as Classification;
        if (
          !["completed", "repairable_pause", "escalation_required"].includes(
            route,
          )
        )
          throw new Error("Unusable implementation judgment");
        const latest = requiredReport(context);
        // Consequential or mixed blockers can never enter autonomous repair.
        if (
          requiredSnapshot(context).state === "blocked" ||
          latest.blockers.some((blocker) => blocker.escalation)
        )
          route = "escalation_required";
        else if (
          route === "completed" &&
          !completionSupported(
            requiredSnapshot(context),
            latest,
            attempts(context),
          )
        )
          route = "repairable_pause";
        return { route };
      },
    }),
    budget: compute({
      run: (context) => ({
        route:
          attempts(context) >= 10
            ? "exhausted"
            : object(context.outputs.classification).route,
      }),
    }),
    escalation: compute({
      run(context) {
        const latest = requiredReport(context);
        return {
          route: latest.blockers.some((blocker) => blocker.escalation)
            ? "usable"
            : "assess",
          report: latest,
        };
      },
    }),
    assess: acp({
      ...fresh,
      prompt: (context) =>
        `Read-only escalation assessment for changeId ${target(context).changeId}. Do not edit files, perform repairs, invoke verification, or invent consent. The task-and-gate judge requires escalation but the latest report has no usable consequential issue packet. Ground consequential blockers in the current apply state and report. Identify ambiguity, missing artifacts, scoped design changes, destructive actions, or external access requirements with recommendations and explicit requested authorization scope. Return ONLY a JSON Report using exactly the prior report shape below; preserve its summary, task and gate evidence, and delegated groups. Add blockers with unique cycle-specific IDs, nonblank issue/recommendation/scope and escalation:true. Do not manufacture gate evidence. If no consequential blocker can be established, leave blockers empty; the flow will terminate rather than guess.\n${JSON.stringify({ current: current(context), prior: report(context), attempt: attempts(context) })}`,
      parse: (raw, context) => parseReport(raw, attempts(context)),
    }),
    assessed_packet: compute({
      run(context) {
        const assessed = context.outputs.assess as Report;
        if (!assessed.blockers.some((blocker) => blocker.escalation))
          throw new Error(
            "Assessment supplied no consequential steering packet",
          );
        return assessed;
      },
    }),
    steering: action({
      timeoutMs: 604800000 + 1000,
      async run(context) {
        try {
          return {
            route: "complete",
            answers: await (deps.steering ?? collectSteering)(
              requiredPacket(context)
                .blockers.filter((blocker) => blocker.escalation)
                .map((blocker) => ({
                  ...blocker,
                  issue: `${blocker.issue}\nRequested authorization scope: ${blocker.scope}`,
                })),
              context.signal,
            ),
          };
        } catch (error) {
          if (!(error instanceof SteeringError)) throw error;
          return { route: error.outcome, reason: error.message };
        }
      },
    }),
    authorize: compute({
      run(context) {
        const answers = object(object(context.outputs.steering).answers);
        const latest = requiredPacket(context);
        if (
          latest.blockers
            .filter((blocker) => blocker.escalation)
            .some((blocker) => !Object.hasOwn(answers, blocker.id))
        )
          throw new Error(
            "Missing explicit steering for a consequential issue",
          );
        return [
          ...authorizations(context),
          ...authorize(latest, answers as Record<string, string>),
        ];
      },
    }),
    success: finish(
      "success",
      "Tasks and applicable current gates complete; not independent verification.",
    ),
    limit: finish(
      "limit_reached",
      "Ten repair dispatches consumed; unresolved tasks, gates or blockers remain.",
    ),
    needs_human: finish("needs_human", (context) =>
      String(object(context.outputs.steering).reason),
    ),
    cancelled: finish(
      "cancelled",
      "Current phase cancelled; earlier edits preserved.",
    ),
    steering_failed: finish("failed", (context) =>
      String(object(context.outputs.steering).reason),
    ),
    failed: finish("failed", (context) =>
      Object.values(context.results)
        .filter((result) => result.outcome !== "ok")
        .map((result) => `${result.nodeId}: ${result.error ?? result.outcome}`)
        .join("; "),
    ),
    unsuccessful: compute({
      run(context) {
        const result = context.state.steps
          .filter((step) =>
            [
              "limit",
              "needs_human",
              "cancelled",
              "steering_failed",
              "failed",
            ].includes(step.nodeId),
          )
          .at(-1)?.output;
        throw new Error(
          `Implementation unsuccessful: ${JSON.stringify(result)}`,
        );
      },
    }),
  };
  const edges: FlowEdge[] = [];
  const guarded = (from: string, to: string) =>
    edges.push({
      from,
      switch: {
        on: "$result.outcome",
        cases: {
          ok: to,
          failed: "failed",
          timed_out: "failed",
          cancelled: "cancelled",
        },
      },
    });
  // Guard each phase's result before reading its output for a route.
  const routing = (from: string, cases: Record<string, string>) => {
    const relay = `${from}_route`;
    guarded(from, relay);
    nodes[relay] = compute({ run: (context) => context.outputs[from] });
    edges.push({ from: relay, switch: { on: "$.route", cases } });
  };
  guarded("preflight", "snapshot");
  guarded("snapshot", "apply");
  guarded("apply", "refresh");
  guarded("repair", "refresh");
  guarded("refresh", "judge");
  guarded("judge", "classification");
  routing("classification", {
    completed: "success",
    repairable_pause: "budget",
    escalation_required: "budget",
  });
  routing("budget", {
    exhausted: "limit",
    repairable_pause: "repair",
    escalation_required: "escalation",
  });
  routing("escalation", { usable: "steering", assess: "assess" });
  guarded("assess", "assessed_packet");
  guarded("assessed_packet", "steering");
  routing("steering", {
    complete: "authorize",
    needs_human: "needs_human",
    cancelled: "cancelled",
    failed: "steering_failed",
  });
  guarded("authorize", "repair");
  for (const from of [
    "limit",
    "needs_human",
    "cancelled",
    "steering_failed",
    "failed",
  ])
    edges.push({ from, to: "unsuccessful" });
  return defineFlow({
    name: "openspec-implement",
    startAt: "preflight",
    nodes,
    edges,
  });
}
