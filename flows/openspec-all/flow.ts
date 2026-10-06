import { AsyncLocalStorage } from "node:async_hooks";
import {
  compute,
  defineFlow,
  type FlowDefinition,
  type FlowEdge,
  type FlowNodeContext,
  type FlowNodeDefinition,
} from "acpx/flows";
import {
  createFinalizeFlow,
  type FinalizeDependencies,
  type FinalizeResult,
} from "../openspec-finalize/flow.js";
import { createGroomFlow } from "../openspec-groom/flow.js";
import { createImplementFlow } from "../openspec-implement/flow.js";
import { createVerifyFlow } from "../openspec-verify/flow.js";
import { type Command, command } from "../shared/command.js";
import type { LocalTarget } from "../shared/local-target.js";
import type { collectSteering } from "../shared/steering.js";
import {
  type ScopedCallback,
  type ScopedCallbackWrapper,
  scopeGraph,
} from "./adapter.js";
import {
  type AllResult,
  type ChildResult,
  type Outcome,
  preflight,
  type Stage,
  type StageResult,
  sameTarget,
  stages,
  validateBoundary,
  validateResult,
} from "./helpers.js";

export type {
  AllInput,
  AllResult,
  ChildResult,
  Outcome,
  Stage,
  StageResult,
} from "./helpers.js";

interface Factories {
  groom: typeof createGroomFlow;
  implement: typeof createImplementFlow;
  verify: typeof createVerifyFlow;
  finalize: typeof createFinalizeFlow;
}
export interface AllDependencies {
  cwd?: string;
  command?: Command;
  steering?: typeof collectSteering;
  emit?: (result: AllResult) => void;
  progress?: (message: string) => void;
  move?: FinalizeDependencies["move"];
  now?: FinalizeDependencies["now"];
  /** Native factory seam for model-free composition contract tests. */
  factories?: Partial<Factories>;
}
interface Progress {
  target?: LocalTarget;
  active: Stage | null;
  statuses: StageResult[];
  error?: string;
  captureErrors: Partial<Record<Stage, string>>;
  cancelled: boolean;
  emitted?: AllResult;
  signal?: AbortSignal;
  cleanup?: () => void;
}
const selected = (c: FlowNodeContext) =>
  c.input && typeof c.input === "object" && "changeId" in c.input
    ? String(c.input.changeId)
    : "unknown";
const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** One native graph: no nested runners, subprocess stages, or copied policies. */
export function createAllFlow(deps: AllDependencies = {}): FlowDefinition {
  const run = deps.command ?? command;
  const emit =
    deps.emit ??
    ((result: AllResult) => {
      process.stdout.write(`${JSON.stringify(result)}\n`);
      process.stderr.write(
        `${result.changeId}: ${result.outcome}${result.activeStage ? ` at ${result.activeStage}` : ""} — ${result.summary}\n`,
      );
    });
  const log =
    deps.progress ??
    ((text: string) => {
      process.stderr.write(`${text}\n`);
    });
  const records = new Map<string, Progress>();
  const contexts = new Map<Stage, FlowNodeContext>();
  const storage = new AsyncLocalStorage<FlowNodeContext>();
  const progress = (c: FlowNodeContext) => {
    let p = records.get(c.state.runId);
    if (!p) {
      p = {
        active: null,
        statuses: stages.map((stage) => ({
          stage,
          status: "not_started",
          result: null,
        })),
        captureErrors: {},
        cancelled: false,
      };
      records.set(c.state.runId, p);
    }
    return p;
  };
  const slot = (p: Progress, stage: Stage) => p.statuses[stages.indexOf(stage)];
  const publish = (
    c: FlowNodeContext,
    outcome: Outcome,
    summary: string,
  ): AllResult => {
    const p = progress(c);
    p.cleanup?.();
    if (p.emitted) return p.emitted;
    if (
      outcome !== "success" &&
      p.active &&
      slot(p, p.active).status === "running"
    )
      slot(p, p.active).status = outcome;
    const finalization = slot(p, "finalize").result as FinalizeResult | null;
    const result: AllResult = {
      changeId: p.target?.changeId ?? selected(c),
      workspace: p.target?.cwd ?? null,
      outcome,
      summary,
      activeStage: p.active,
      failedStage: outcome === "success" ? null : p.active,
      stages: p.statuses.map((s) => ({ ...s })),
      finalization,
      archive: finalization ? { ...finalization.archive } : null,
    };
    // Set before calling an external seam: even a throwing emitter is not retried.
    p.emitted = result;
    emit(result);
    return result;
  };
  const assertActive = (c: FlowNodeContext) => {
    if (progress(c).cancelled)
      throw new Error("Pipeline cancelled; later dispatch prohibited");
    c.signal?.throwIfAborted();
  };
  const observe = (c: FlowNodeContext, callback?: ScopedCallback) => {
    const p = progress(c);
    const signal = c.signal;
    if (p.signal !== signal) {
      p.cleanup?.();
      p.signal = signal;
    }
    if (signal && !p.cleanup) {
      const interrupted = () => {
        p.cleanup?.();
        const reason: unknown = signal.reason;
        // Ordinary deadlines keep native timed_out guards and failed outcomes.
        if (reason instanceof Error && reason.name === "InterruptedError") {
          p.cancelled = true;
          // Child listeners installed by the original callbacks may emit their
          // observed partial result in this same abort event. Never invent one.
          queueMicrotask(() => {
            try {
              publish(
                c,
                "cancelled",
                `Interrupted during ${callback ? `${callback.stage}:${callback.nodeId}` : (c.state.currentNode ?? "pipeline preflight")}; earlier edits preserved.`,
              );
            } catch {
              /* Best effort when the output transport is unavailable. */
            }
          });
        }
      };
      signal.addEventListener("abort", interrupted, { once: true });
      p.cleanup = () => {
        signal.removeEventListener("abort", interrupted);
        p.cleanup = undefined;
      };
      if (signal.aborted) interrupted();
    }
    assertActive(c);
  };
  const wrap: ScopedCallbackWrapper = <T>(
    c: FlowNodeContext,
    invoke: () => T,
    callback: ScopedCallback,
  ): T => {
    const stage = callback.stage as Stage;
    contexts.set(stage, c);
    observe(c, callback);
    const p = progress(c);
    if (p.target && c.outputs[`${stage}:preflight`])
      sameTarget(c.outputs[`${stage}:preflight`], p.target);
    const cleanup = () => {
      if (p.signal === c.signal) p.cleanup?.();
    };
    try {
      const result = storage.run(c, invoke);
      if (
        result &&
        typeof result === "object" &&
        "then" in result &&
        typeof result.then === "function"
      ) {
        return (
          callback.surface === "cwd" || callback.surface === "prompt"
            ? Promise.resolve(result).catch((error) => {
                cleanup();
                throw error;
              })
            : Promise.resolve(result).finally(cleanup)
        ) as T;
      }
      // ACP cwd/prompt listeners cover connection/session/prompt attempts until
      // parse, a later signal, or terminal publication. No listeners cover gaps.
      if (callback.surface !== "cwd" && callback.surface !== "prompt")
        cleanup();
      return result;
    } catch (error) {
      cleanup();
      throw error;
    }
  };
  const capture = (stage: Stage, value: ChildResult) => {
    const c = storage.getStore() ?? contexts.get(stage);
    if (!c) throw new Error("Constituent emitted outside an observed callback");
    const p = progress(c);
    try {
      const result = validateResult(
        stage,
        value,
        p.target?.changeId ?? selected(c),
      );
      // Snapshot now: later mutation cannot silently alter already-captured data.
      const saved = validateResult(
        stage,
        JSON.parse(JSON.stringify(result)),
        p.target?.changeId ?? selected(c),
      );
      validateBoundary(stage, saved, c.outputs);
      const previous = slot(p, stage).result;
      if (previous && JSON.stringify(previous) !== JSON.stringify(saved))
        throw new Error("Contradictory constituent terminal emissions");
      slot(p, stage).result = saved;
    } catch (error) {
      p.captureErrors[stage] = message(error);
    }
  };
  const factories: Factories = {
    groom: createGroomFlow,
    implement: createImplementFlow,
    verify: createVerifyFlow,
    finalize: createFinalizeFlow,
    ...deps.factories,
  };
  const common = { cwd: deps.cwd, command: run, steering: deps.steering };
  const graphs: Record<Stage, FlowDefinition> = {
    groom: factories.groom({ ...common, emit: (r) => capture("groom", r) }),
    implement: factories.implement({
      ...common,
      emit: (r) => capture("implement", r),
    }),
    verify: factories.verify({ ...common, emit: (r) => capture("verify", r) }),
    finalize: factories.finalize({
      cwd: deps.cwd,
      command: run,
      move: deps.move,
      now: deps.now,
      emit: (r) => capture("finalize", r),
    }),
  };
  const nodes: Record<string, FlowNodeDefinition> = {
    preflight: compute({
      async run(c) {
        observe(c);
        try {
          const target = await preflight(
            c.input,
            deps.cwd ?? process.cwd(),
            run,
            c.signal,
          );
          assertActive(c);
          progress(c).target = target;
          return target;
        } finally {
          progress(c).cleanup?.();
        }
      },
    }),
    failed: compute({
      run(c) {
        const p = progress(c);
        const child = p.active ? slot(p, p.active).result : null;
        const last = c.state.steps.at(-1);
        const executionError =
          last && last.outcome !== "ok"
            ? `${last.nodeId}: ${last.error ?? last.outcome}`
            : undefined;
        const outcome =
          p.error || executionError
            ? "failed"
            : child?.outcome && child.outcome !== "success"
              ? child.outcome
              : "failed";
        return publish(
          c,
          p.cancelled ? "cancelled" : outcome,
          p.error ??
            executionError ??
            child?.summary ??
            (Object.values(c.results)
              .filter((r) => r.outcome !== "ok")
              .map((r) => `${r.nodeId}: ${r.error ?? r.outcome}`)
              .join("; ") ||
              "Pipeline failed; earlier edits preserved."),
        );
      },
    }),
    success: compute({
      run: (c) =>
        publish(
          c,
          "success",
          "Grooming, implementation, independent verification and finalization succeeded; archive confirmed.",
        ),
    }),
    unsuccessful: compute({
      run(c) {
        progress(c).cleanup?.();
        throw new Error(
          `OpenSpec pipeline unsuccessful: ${JSON.stringify(progress(c).emitted)}`,
        );
      },
    }),
  };
  const edges: FlowEdge[] = [
    {
      from: "preflight",
      switch: {
        on: "$result.outcome",
        cases: {
          ok: "enter_groom",
          failed: "failed",
          timed_out: "failed",
          cancelled: "failed",
        },
      },
    },
    { from: "failed", to: "unsuccessful" },
  ];
  for (const stage of stages) {
    const original = graphs[stage];
    // Only the intentional terminal throw is intercepted. No operational
    // callback exception is suppressed or treated as successful child evidence.
    if (
      original.nodes.unsuccessful?.nodeType !== "compute" ||
      original.nodes.success?.nodeType !== "compute"
    )
      throw new Error(`Unsupported ${stage} terminal graph contract`);
    const graph = scopeGraph(
      stage,
      {
        ...original,
        nodes: {
          ...original.nodes,
          unsuccessful: compute({
            run: () => ({ parentFailureRouting: true }),
          }),
        },
      },
      wrap,
    );
    for (const [id, node] of Object.entries(graph.nodes)) {
      // Native ACP nodes without a parser normally return raw text. An identity
      // parser preserves that output while closing the observed attempt scope.
      if (node.nodeType === "acp" && !node.parse)
        node.parse = (raw, c) =>
          wrap(c, () => raw, {
            stage,
            nodeId: id.slice(stage.length + 1),
            surface: "parse",
          });
    }
    Object.assign(nodes, graph.nodes);
    for (const edge of graph.edges) {
      if (!("to" in edge) && edge.switch.on.startsWith("$result.")) {
        edges.push(edge);
        continue;
      }
      // acpx stops on a failed node with an output/direct edge. Add a native
      // result guard without altering its successful output routing or policies.
      const relay = `guard_${stage}_${edge.from.slice(stage.length + 1)}`;
      nodes[relay] = compute({ run: (c) => c.outputs[edge.from] });
      edges.push(
        {
          from: edge.from,
          switch: {
            on: "$result.outcome",
            cases: {
              ok: relay,
              failed: "failed",
              timed_out: "failed",
              cancelled: "failed",
            },
          },
        },
        { ...edge, from: relay },
      );
    }
    const enter = `enter_${stage}`;
    nodes[enter] = compute({
      async run(c) {
        const p = progress(c);
        if (p.cancelled)
          throw new Error("Pipeline cancelled; later stage entry prohibited");
        p.active = stage;
        slot(p, stage).status = "running";
        observe(c, { stage, nodeId: "entry", surface: "run" });
        log(`[openspec-all:${stage}] starting`);
        try {
          if (!p.target) throw new Error("Missing canonical pipeline target");
          const refreshed = await preflight(
            c.input,
            p.target.cwd,
            run,
            c.signal,
          );
          assertActive(c);
          sameTarget(refreshed, p.target);
          return refreshed;
        } finally {
          p.cleanup?.();
        }
      },
    });
    edges.push({
      from: enter,
      switch: {
        on: "$result.outcome",
        cases: {
          ok: graph.startAt,
          failed: "failed",
          timed_out: "failed",
          cancelled: "failed",
        },
      },
    });
    const steering = nodes[`${stage}:steering`];
    if (steering && "run" in steering && steering.run) {
      const callback = steering.run;
      steering.run = (c) => {
        log(`[openspec-all:${stage}] paused for scoped human steering`);
        return callback(c);
      };
    }
    const boundary = `boundary_${stage}`;
    nodes[boundary] = compute({
      run(c) {
        const p = progress(c);
        try {
          assertActive(c);
          if (p.captureErrors[stage]) throw new Error(p.captureErrors[stage]);
          const child = slot(p, stage).result;
          if (!child) throw new Error("Missing constituent terminal result");
          if (!p.target) throw new Error("Missing canonical pipeline target");
          // An early preflight failure need not have a target output. A successful
          // child always must demonstrate the same canonical preflight identity.
          if (child.outcome === "success" || c.outputs[`${stage}:preflight`])
            sameTarget(c.outputs[`${stage}:preflight`], p.target);
          const terminal = c.state.steps.at(-1);
          if (!terminal || terminal.outcome !== "ok")
            throw new Error("Constituent terminal execution failed");
          if (child.outcome === "success") {
            if (
              terminal.nodeId !== `${stage}:success` ||
              JSON.stringify(terminal.output) !== JSON.stringify(child)
            )
              throw new Error(
                "Contradictory constituent success routing/output",
              );
            validateBoundary(stage, child, c.outputs);
          } else {
            if (terminal.nodeId !== `${stage}:unsuccessful`)
              throw new Error("Contradictory constituent failure routing");
            const finished = c.state.steps
              .filter(
                (step) =>
                  step.nodeId.startsWith(`${stage}:`) &&
                  [
                    "limit",
                    "missing",
                    "inconclusive",
                    "needs_human",
                    "cancelled",
                    "steering_failed",
                    "failed",
                  ].includes(step.nodeId.slice(stage.length + 1)),
              )
              .at(-1);
            if (
              !finished ||
              finished.outcome !== "ok" ||
              JSON.stringify(finished.output) !== JSON.stringify(child)
            )
              throw new Error("Contradictory constituent failure output");
          }
          slot(p, stage).status = child.outcome;
          log(`[openspec-all:${stage}] ${child.outcome}`);
          return { route: child.outcome === "success" ? "next" : "stop" };
        } catch (error) {
          p.error = `${stage}: ${message(error)}`;
          slot(p, stage).status = p.cancelled ? "cancelled" : "failed";
          return { route: "stop" };
        } finally {
          p.cleanup?.();
        }
      },
    });
    for (const terminal of ["success", "unsuccessful"])
      edges.push({
        from: `${stage}:${terminal}`,
        switch: {
          on: "$result.outcome",
          cases: {
            ok: boundary,
            failed: "failed",
            timed_out: "failed",
            cancelled: "failed",
          },
        },
      });
    edges.push({
      from: boundary,
      switch: {
        on: "$.route",
        cases: {
          next:
            stage === "finalize"
              ? "success"
              : `enter_${stages[stages.indexOf(stage) + 1]}`,
          stop: "failed",
        },
      },
    });
  }
  return defineFlow({
    name: "openspec-all",
    startAt: "preflight",
    nodes,
    edges,
  });
}
