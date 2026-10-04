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
  type Assessment,
  type Authorization,
  acceptanceSupported,
  assessPrompt,
  authorize,
  currentReport,
  type Finding,
  judgePrompt,
  parseAssessment,
  parseRepairReport,
  parseReport,
  preflight,
  type Report,
  repairPrompt,
  type Snapshot,
  snapshot,
  type Target,
  verifyPrompt,
} from "./helpers.js";

export interface VerifyResult {
  changeId: string;
  outcome: "success" | "limit_reached" | "needs_human" | "cancelled" | "failed";
  repairAttempts: number;
  summary: string;
  remaining: Finding[];
  report: Report | null;
}
interface Dependencies {
  cwd?: string;
  command?: Command;
  steering?: typeof collectSteering;
  emit?: (result: VerifyResult) => void;
}
const target = (c: FlowNodeContext) => c.outputs.preflight as Target;
const current = (c: FlowNodeContext) => c.outputs.refresh as Snapshot;
const latest = (c: FlowNodeContext) => c.outputs.evidence as Report;
const attempts = (c: FlowNodeContext) =>
  c.state.steps.filter((s) => s.nodeId === "repair").length;
const steering = (c: FlowNodeContext) =>
  (c.outputs.authorize ?? []) as Authorization[];
const assessment = (c: FlowNodeContext) => c.outputs.assess as Assessment;

export function createVerifyFlow(deps: Dependencies = {}) {
  const run = deps.command ?? command;
  const emit =
    deps.emit ??
    ((result: VerifyResult) => {
      process.stdout.write(`${JSON.stringify(result)}\n`);
      process.stderr.write(
        `${result.changeId}: ${result.outcome}, ${result.repairAttempts}/10 repairs — ${result.summary}\n`,
      );
    });
  const emittedRuns = new Set<string>();
  const publish = (
    c: FlowNodeContext,
    outcome: VerifyResult["outcome"],
    summary: string,
    interruptedRepair = false,
  ): VerifyResult => {
    const report = latest(c) ?? (c.outputs.verify as Report | undefined);
    const result: VerifyResult = {
      changeId:
        target(c)?.changeId ??
        (c.input && typeof c.input === "object" && "changeId" in c.input
          ? String(c.input.changeId)
          : "unknown"),
      outcome,
      repairAttempts: attempts(c) + Number(interruptedRepair),
      summary,
      remaining: report?.findings ?? [],
      report: report ?? null,
    };
    if (!emittedRuns.has(c.state.runId)) {
      emittedRuns.add(c.state.runId);
      emit(result);
    }
    return result;
  };
  const observed = new WeakSet<AbortSignal>();
  const observe = (c: FlowNodeContext, nodeId: string) => {
    const signal = c.signal;
    if (!signal || observed.has(signal)) return;
    observed.add(signal);
    const interrupted = () => {
      const reason: unknown = signal.reason;
      // acpx global interruption bypasses graph routing and never records the
      // active step. Observe its attempt signal, not process-wide signals. Leave
      // ordinary timeouts/failures to guarded edges and cleanup to the runner.
      if (reason instanceof Error && reason.name === "InterruptedError")
        publish(
          c,
          "cancelled",
          `Interrupted during ${nodeId}; earlier edits preserved.`,
          nodeId === "repair",
        );
    };
    signal.addEventListener("abort", interrupted, { once: true });
    if (signal.aborted) interrupted();
  };
  const finish = (
    outcome: VerifyResult["outcome"],
    summary: string | ((c: FlowNodeContext) => string),
  ) =>
    compute({
      run: (c) =>
        publish(
          c,
          outcome,
          typeof summary === "function" ? summary(c) : summary,
        ),
    });
  const fresh = {
    profile: "pi",
    session: { isolated: true },
    cwd: (c: FlowNodeContext) => target(c).cwd,
  };
  const nodes: Record<string, FlowNodeDefinition> = {
    preflight: compute({
      run: (c) => preflight(c.input, deps.cwd ?? process.cwd(), run, c.signal),
    }),
    refresh: compute({ run: (c) => snapshot(target(c), run, c.signal) }),
    verify: acp({
      ...fresh,
      timeoutMs: 90 * 60 * 1000,
      prompt: (c) => verifyPrompt(target(c), current(c), steering(c)),
      parse: (raw) => parseReport(raw),
    }),
    evidence: compute({
      run: (c) => currentReport(c.outputs.verify as Report, current(c)),
    }),
    judge: decision({
      ...fresh,
      choices: ["accepted", "blocking", "inconclusive"],
      question: (c) => judgePrompt(current(c), latest(c)),
    }),
    classification: compute({
      run(c) {
        let route = object(c.outputs.judge).route;
        if (!["accepted", "blocking", "inconclusive"].includes(String(route)))
          throw new Error("Invalid verification classification");
        if (!latest(c).conclusive || route === "inconclusive")
          throw new Error(
            "Inconclusive verification report; no repair or automatic retry",
          );
        if (
          route === "accepted" &&
          !acceptanceSupported(c.outputs.verify as Report, current(c))
        )
          route = "blocking";
        if (
          route === "blocking" &&
          !latest(c).findings.some((f) => f.severity !== "SUGGESTION")
        )
          throw new Error(
            "Blocking classification without usable blocking findings",
          );
        return { route };
      },
    }),
    budget: compute({
      run: (c) => ({ route: attempts(c) >= 10 ? "exhausted" : "available" }),
    }),
    assess: acp({
      ...fresh,
      prompt: (c) =>
        assessPrompt(target(c), current(c), latest(c), steering(c)),
      parse: (raw, c) => parseAssessment(raw, target(c), latest(c)),
    }),
    resolution_route: compute({
      run: (c) => ({
        route: assessment(c).resolutions.some((r) => r.escalation)
          ? "steering"
          : "mechanical",
      }),
    }),
    steering: action({
      timeoutMs: 604801000,
      async run(c) {
        try {
          return {
            route: "complete",
            answers: await (deps.steering ?? collectSteering)(
              assessment(c)
                .resolutions.filter((r) => r.escalation)
                .map((r) => ({
                  id: r.id,
                  issue: `${r.issue}\nReason: ${r.reason}\nRequested authorization scope: ${r.scope}`,
                  recommendation: r.recommendation,
                })),
              c.signal,
            ),
          };
        } catch (error) {
          if (!(error instanceof SteeringError)) throw error;
          return { route: error.outcome, reason: error.message };
        }
      },
    }),
    authorize: compute({
      run: (c) => [
        ...steering(c),
        ...authorize(
          assessment(c),
          object(object(c.outputs.steering).answers) as Record<string, string>,
        ),
      ],
    }),
    repair: acp({
      ...fresh,
      timeoutMs: 90 * 60 * 1000,
      prompt: (c) =>
        repairPrompt(
          target(c),
          current(c),
          latest(c),
          assessment(c),
          steering(c),
          attempts(c) + 1,
        ),
      parse: (raw) => parseRepairReport(raw),
    }),
    success: finish(
      "success",
      "Conclusive verification accepted; suggestions may remain. No sync or archive performed.",
    ),
    limit: finish(
      "limit_reached",
      "Ten repair dispatches consumed; freshly verified blocking findings remain.",
    ),
    needs_human: finish("needs_human", (c) =>
      String(object(c.outputs.steering).reason),
    ),
    steering_failed: finish("failed", (c) =>
      String(object(c.outputs.steering).reason),
    ),
    cancelled: finish(
      "cancelled",
      "Current phase cancelled; earlier edits preserved.",
    ),
    failed: finish("failed", (c) =>
      Object.values(c.results)
        .filter((r) => r.outcome !== "ok")
        .map((r) => `${r.nodeId}: ${r.error ?? r.outcome}`)
        .join("; "),
    ),
    unsuccessful: compute({
      run(c) {
        const result = c.state.steps
          .filter((s) =>
            [
              "limit",
              "needs_human",
              "steering_failed",
              "cancelled",
              "failed",
            ].includes(s.nodeId),
          )
          .at(-1)?.output;
        throw new Error(`Verification unsuccessful: ${JSON.stringify(result)}`);
      },
    }),
  };
  // Register at the beginning of each asynchronous phase, including ACP cwd
  // resolution before connection/session initialization can be interrupted.
  for (const [id, node] of Object.entries(nodes)) {
    if (node.nodeType === "acp") {
      const cwd = node.cwd;
      node.cwd = (c) => {
        observe(c, id);
        return typeof cwd === "function" ? cwd(c) : cwd;
      };
    } else if ("run" in node && typeof node.run === "function") {
      const callback = node.run;
      node.run = (c) => {
        observe(c, id);
        return callback(c);
      };
    }
  }
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
  const routing = (from: string, cases: Record<string, string>) => {
    const relay = `${from}_route_guard`;
    guarded(from, relay);
    nodes[relay] = compute({ run: (c) => c.outputs[from] });
    edges.push({ from: relay, switch: { on: "$.route", cases } });
  };
  guarded("preflight", "refresh");
  guarded("refresh", "verify");
  guarded("verify", "evidence");
  guarded("evidence", "judge");
  guarded("judge", "classification");
  routing("classification", { accepted: "success", blocking: "budget" });
  routing("budget", { exhausted: "limit", available: "assess" });
  guarded("assess", "resolution_route");
  routing("resolution_route", { steering: "steering", mechanical: "repair" });
  routing("steering", {
    complete: "authorize",
    needs_human: "needs_human",
    cancelled: "cancelled",
    failed: "steering_failed",
  });
  guarded("authorize", "repair");
  guarded("repair", "refresh");
  for (const from of [
    "limit",
    "needs_human",
    "steering_failed",
    "cancelled",
    "failed",
  ])
    edges.push({ from, to: "unsuccessful" });
  return defineFlow({
    name: "openspec-verify",
    startAt: "preflight",
    nodes,
    edges,
  });
}
