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
import {
  type Assessment,
  type Command,
  command,
  parseAssessment,
  preflight,
  type Target,
  updatePrompt,
  validate,
} from "./groom.js";
import { collectSteering, SteeringError } from "./steering.js";

export interface GroomResult {
  changeId: string;
  outcome: "success" | "limit_reached" | "needs_human" | "cancelled" | "failed";
  updateAttempts: number;
  summary: string;
  remaining: unknown;
}
interface Dependencies {
  cwd?: string;
  command?: Command;
  steering?: typeof collectSteering;
  emit?: (result: GroomResult) => void;
}
const target = (context: FlowNodeContext) =>
  context.outputs.preflight as Target;
const assessment = (context: FlowNodeContext) =>
  context.outputs.assess as Assessment;
const attempts = (context: FlowNodeContext) =>
  context.state.steps.filter((step) => step.nodeId === "update").length;
function currentIssues(context: FlowNodeContext): unknown {
  const validation = context.outputs.validate as {
    route: string;
    issues: unknown[];
  };
  return validation?.route === "invalid"
    ? validation.issues
    : context.outputs.review;
}
export function createGroomFlow(deps: Dependencies = {}) {
  const run = deps.command ?? command;
  const emit =
    deps.emit ??
    ((result) => {
      process.stdout.write(`${JSON.stringify(result)}\n`);
      process.stderr.write(
        `${result.changeId}: ${result.outcome}, ${result.updateAttempts}/10 updates — ${result.summary}\n`,
      );
    });
  const finish = (
    outcome: GroomResult["outcome"],
    summary: string | ((c: FlowNodeContext) => string),
  ) =>
    compute({
      run(context) {
        const result: GroomResult = {
          changeId:
            target(context)?.changeId ??
            (context.input &&
            typeof context.input === "object" &&
            "changeId" in context.input
              ? String(context.input.changeId)
              : "unknown"),
          outcome,
          updateAttempts: attempts(context),
          summary: typeof summary === "function" ? summary(context) : summary,
          remaining:
            (outcome === "success" || outcome === "limit_reached"
              ? currentIssues(context)
              : (context.outputs.assess ?? currentIssues(context))) ?? null,
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
    validate: compute({
      run: (context) => validate(target(context), run, context.signal),
    }),
    review: acp({
      ...fresh,
      prompt: (context) => `/skill:openspec-review ${target(context).changeId}`,
    }),
    classify: decision({
      ...fresh,
      choices: ["critical", "clear", "inconclusive"],
      question: (context) =>
        `Read this current review, not just its verdict. Choose critical only for actual Critical findings; clear only for a complete conclusive review with no Critical findings, even if Major findings or blockers remain. Choose inconclusive for incomplete, ambiguous, or unusable review. Do not edit files.\n${context.outputs.review}`,
    }),
    budget: compute({
      run: (context) => ({
        route: attempts(context) >= 10 ? "exhausted" : "available",
      }),
    }),
    assess: acp({
      ...fresh,
      prompt: (context) =>
        `Read-only resolution assessment for ${target(context).changeId}. Assess ONLY current structural errors or Critical findings. Propose repairs grounded in existing intent/conventions. Escalate architecture, design, product, high-stakes changes and materially different alternatives. All consequential issues need human steering before ANY fixes, including autonomous corrections. Report required missing artifacts instead of creating them. Return only JSON: {"conclusive":boolean,"missingArtifacts":string[],"resolutions":[{"id":"cycle-unique-id","issue":"...","recommendation":"...","escalation":boolean,"paths":["absolute-existing-path"]}]}. If uncertain mark conclusive false. Every resolution needs unique id, nonblank issue/recommendation and existing allowed paths. Do not edit.\n${JSON.stringify({ changeId: target(context).changeId, currentIssues: currentIssues(context), existingArtifactAllowlist: target(context).artifacts })}`,
      parse: (raw, context) => parseAssessment(raw, target(context)),
    }),
    steering: action({
      timeoutMs: 604800000 + 1000,
      async run(context) {
        try {
          return {
            route: "complete",
            answers: await (deps.steering ?? collectSteering)(
              assessment(context).resolutions.filter(
                (issue) => issue.escalation,
              ),
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
        const answers =
          assessment(context).route === "steering"
            ? (context.outputs.steering as { answers: Record<string, string> })
                .answers
            : {};
        return updatePrompt(target(context), assessment(context), answers);
      },
    }),
    update: acp({
      ...fresh,
      prompt: (context) => String(context.outputs.authorize),
    }),
    success: finish(
      "success",
      "Validation passes; no Critical findings. This is not implementation readiness.",
    ),
    limit: finish(
      "limit_reached",
      "Ten update attempts consumed; unresolved errors or Critical findings remain.",
    ),
    missing: finish(
      "failed",
      (context) =>
        `Required artifacts are missing; creation is unsupported: ${assessment(context).missingArtifacts.join(", ")}`,
    ),
    inconclusive: finish("failed", "Review or assessment is inconclusive."),
    needs_human: finish("needs_human", (context) =>
      String((context.outputs.steering as { reason: string }).reason),
    ),
    cancelled: finish(
      "cancelled",
      "Current phase cancelled; earlier edits preserved.",
    ),
    steering_failed: finish("failed", (context) =>
      String((context.outputs.steering as { reason: string }).reason),
    ),
    failed: finish("failed", (context) =>
      Object.values(context.results)
        .filter((result) => result.outcome !== "ok")
        .map((result) => `${result.nodeId}: ${result.error}`)
        .join("; "),
    ),
    unsuccessful: compute({
      run(context) {
        const result = Object.values(context.outputs)
          .filter(
            (value) => value && typeof value === "object" && "outcome" in value,
          )
          .at(-1);
        throw new Error(`Grooming unsuccessful: ${JSON.stringify(result)}`);
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
  // Result guards precede output routing so failed phases produce a terminal result.
  guarded("preflight", "validate");
  guarded("validate", "validation_route");
  nodes.validation_route = compute({
    run: (context) => context.outputs.validate,
  });
  edges.push({
    from: "validation_route",
    switch: { on: "$.route", cases: { valid: "review", invalid: "budget" } },
  });
  guarded("review", "classify");
  guarded("classify", "classification_route");
  nodes.classification_route = compute({
    run: (context) => context.outputs.classify,
  });
  edges.push({
    from: "classification_route",
    switch: {
      on: "$.route",
      cases: {
        clear: "success",
        critical: "budget",
        inconclusive: "inconclusive",
      },
    },
  });
  guarded("budget", "budget_route");
  nodes.budget_route = compute({ run: (context) => context.outputs.budget });
  edges.push({
    from: "budget_route",
    switch: {
      on: "$.route",
      cases: { exhausted: "limit", available: "assess" },
    },
  });
  guarded("assess", "assessment_route");
  nodes.assessment_route = compute({
    run: (context) => context.outputs.assess,
  });
  edges.push({
    from: "assessment_route",
    switch: {
      on: "$.route",
      cases: {
        missing: "missing",
        inconclusive: "inconclusive",
        steering: "steering",
        autonomous: "authorize",
      },
    },
  });
  guarded("steering", "steering_route");
  nodes.steering_route = compute({
    run: (context) => context.outputs.steering,
  });
  edges.push({
    from: "steering_route",
    switch: {
      on: "$.route",
      cases: {
        complete: "authorize",
        needs_human: "needs_human",
        cancelled: "cancelled",
        failed: "steering_failed",
      },
    },
  });
  guarded("authorize", "update");
  guarded("update", "validate");
  for (const from of [
    "limit",
    "missing",
    "inconclusive",
    "needs_human",
    "cancelled",
    "steering_failed",
    "failed",
  ])
    edges.push({ from, to: "unsuccessful" });
  return defineFlow({
    name: "openspec-groom",
    startAt: "preflight",
    nodes,
    edges,
  });
}
export default createGroomFlow();
