import {
  acp,
  action,
  compute,
  defineFlow,
  type FlowEdge,
  type FlowNodeContext,
  type FlowNodeDefinition,
} from "acpx/flows";
import { type Command, command } from "../shared/command.js";
import { object } from "../shared/data.js";
import {
  type Archive,
  type Assessment,
  archive,
  archiveTarget,
  assessPrompt,
  currentContents,
  fingerprint,
  type Move,
  move,
  parseAssessment,
  parseWorker,
  preflight,
  prepare,
  recheck,
  type SyncInputs,
  syncPrompt,
  type Target,
  type WorkerReport,
} from "./helpers.js";

export type Phase = "preflight" | "prepare" | "sync" | "assessment" | "archive";
export type StageState =
  | "not_started"
  | "completed"
  | "failed"
  | "not_applicable";
export interface FinalizeResult {
  changeId: string;
  outcome: "success" | "failed" | "cancelled";
  summary: string;
  phase: Phase;
  failedPhase: Phase | null;
  phases: Record<Phase, StageState>;
  sync: WorkerReport | null;
  assessment: Assessment | null;
  remaining: string[];
  archive: Archive;
}
export interface FinalizeDependencies {
  cwd?: string;
  command?: Command;
  emit?: (result: FinalizeResult) => void;
  move?: Move;
  now?: () => Date;
}
interface Progress {
  phase: Phase;
  phases: Record<Phase, StageState>;
  sync: WorkerReport | null;
  assessment: Assessment | null;
  archive: Archive;
  cancelled: boolean;
  emitted?: FinalizeResult;
  cleanup?: () => void;
  signal?: AbortSignal;
}
const target = (c: FlowNodeContext) => c.outputs.preflight as Target;
const inputs = (c: FlowNodeContext) => c.outputs.prepare as SyncInputs;
const defaults = (): Progress => ({
  phase: "preflight",
  phases: {
    preflight: "not_started",
    prepare: "not_started",
    sync: "not_started",
    assessment: "not_started",
    archive: "not_started",
  },
  sync: null,
  assessment: null,
  archive: { destination: null, state: "not_started" },
  cancelled: false,
});

export function createFinalizeFlow(deps: FinalizeDependencies = {}) {
  const run = deps.command ?? command;
  const emit =
    deps.emit ??
    ((result: FinalizeResult) => {
      process.stdout.write(`${JSON.stringify(result)}\n`);
      process.stderr.write(
        `${result.changeId}: ${result.outcome} at ${result.phase} — ${result.summary}\n`,
      );
    });
  const records = new Map<string, Progress>();
  const progress = (c: FlowNodeContext) => {
    let p = records.get(c.state.runId);
    if (!p) {
      p = defaults();
      records.set(c.state.runId, p);
    }
    return p;
  };
  const publish = (
    c: FlowNodeContext,
    outcome: FinalizeResult["outcome"],
    summary: string,
  ): FinalizeResult => {
    const p = progress(c);
    p.cleanup?.();
    if (p.emitted) return p.emitted;
    const selected =
      c.input && typeof c.input === "object" && "changeId" in c.input
        ? String(c.input.changeId)
        : "unknown";
    if (outcome !== "success" && p.phases[p.phase] !== "completed")
      p.phases[p.phase] = "failed";
    const result: FinalizeResult = {
      changeId: target(c)?.changeId ?? selected,
      outcome,
      summary,
      phase: p.phase,
      failedPhase: outcome === "success" ? null : p.phase,
      phases: { ...p.phases },
      sync: p.sync,
      assessment: p.assessment,
      remaining:
        outcome === "success"
          ? []
          : [
              ...(p.sync?.issues ?? []),
              ...(p.assessment?.issues ?? []),
              ...(p.assessment?.coverage.flatMap(
                (item) => item.discrepancies,
              ) ?? []),
              summary,
            ],
      archive: { ...p.archive },
    };
    p.emitted = result;
    emit(result);
    return result;
  };
  const assertActive = (c: FlowNodeContext) => {
    const p = progress(c);
    if (p.cancelled)
      throw new Error("Finalization cancelled; later dispatch prohibited");
    c.signal?.throwIfAborted();
  };
  // Signals are attempt-scoped, not a public parent signal. Callback gaps,
  // node-start persistence and pre-install routing bypass can leave JSON absent;
  // persisted acpx run history/transcripts are the diagnostic fallback.
  const observe = (c: FlowNodeContext, phase?: Phase) => {
    const p = progress(c);
    const signal = c.signal;
    if (phase) p.phase = phase;
    if (p.signal !== signal) {
      p.cleanup?.();
      p.signal = signal;
    }
    if (signal && !p.cleanup) {
      const interrupted = () => {
        const reason: unknown = signal.reason;
        if (reason instanceof Error && reason.name === "InterruptedError") {
          p.cancelled = true;
          publish(
            c,
            "cancelled",
            `Interrupted during ${p.phase}; earlier edits preserved; archive state is only observed progress.`,
          );
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
  const complete = (c: FlowNodeContext, phase: Phase) => {
    assertActive(c);
    progress(c).phases[phase] = "completed";
  };
  const guardedRun =
    (phase: Phase | undefined, callback: (c: FlowNodeContext) => unknown) =>
    async (c: FlowNodeContext) => {
      observe(c, phase);
      try {
        const result = await callback(c);
        assertActive(c);
        return result;
      } finally {
        progress(c).cleanup?.();
      }
    };
  let moving = false;
  const fresh = {
    profile: "pi",
    session: { isolated: true },
    timeoutMs: 90 * 60 * 1000,
  };
  const nodes: Record<string, FlowNodeDefinition> = {
    preflight: compute({
      run: guardedRun("preflight", async (c) => {
        const selected = await preflight(
          c.input,
          deps.cwd ?? process.cwd(),
          run,
          c.signal,
        );
        complete(c, "preflight");
        return selected;
      }),
    }),
    prepare: compute({
      run: guardedRun("prepare", async (c) => {
        const selected = await prepare(target(c), run, c.signal);
        complete(c, "prepare");
        return selected;
      }),
    }),
    selection: compute({
      run: guardedRun(undefined, (c) => {
        if (!inputs(c).capabilities.length) {
          const p = progress(c);
          p.phases.sync = "not_applicable";
          p.phases.assessment = "not_applicable";
        }
        return { route: inputs(c).capabilities.length ? "sync" : "no_delta" };
      }),
    }),
    sync: acp({
      ...fresh,
      cwd: (c) => {
        observe(c, "sync");
        return target(c).cwd;
      },
      prompt: (c) => {
        observe(c, "sync");
        return syncPrompt(target(c), inputs(c));
      },
      parse: (raw, c) => {
        try {
          assertActive(c);
          const report = parseWorker(raw);
          progress(c).sync = report;
          return report;
        } finally {
          progress(c).cleanup?.();
        }
      },
    }),
    sync_result: compute({
      run: guardedRun("sync", (c) => {
        const report = c.outputs.sync as WorkerReport;
        progress(c).sync = report;
        if (report.outcome !== "success")
          throw new Error(
            `Synchronization failed: ${report.issues.join("; ")}`,
          );
        complete(c, "sync");
        return report;
      }),
    }),
    current: compute({
      run: guardedRun("assessment", async (c) => {
        const current = await currentContents(target(c), inputs(c));
        // This is the exact file snapshot the assessor receives. Recheck it, the
        // deltas and metadata before archive, not a post-assessment recapture.
        return {
          current,
          fingerprint: fingerprint(target(c), inputs(c), current),
        };
      }),
    }),
    assess: acp({
      ...fresh,
      cwd: (c) => {
        observe(c, "assessment");
        return target(c).cwd;
      },
      prompt: (c) => {
        observe(c, "assessment");
        return assessPrompt(
          target(c),
          inputs(c),
          object(c.outputs.current).current as Record<string, string | null>,
        );
      },
      parse: (raw, c) => {
        try {
          assertActive(c);
          const report = parseAssessment(raw, inputs(c));
          progress(c).assessment = report;
          return report;
        } finally {
          progress(c).cleanup?.();
        }
      },
    }),
    acceptance: compute({
      run: guardedRun("assessment", (c) => {
        const report = c.outputs.assess as Assessment;
        progress(c).assessment = report;
        if (report.verdict !== "accepted")
          throw new Error(
            `Sync assessment ${report.verdict}: ${report.summary}`,
          );
        complete(c, "assessment");
        return report;
      }),
    }),
    no_delta: compute({
      run: guardedRun(undefined, (c) => ({
        fingerprint: fingerprint(target(c), inputs(c), {}),
      })),
    }),
    archive: action({
      run: guardedRun("archive", async (c) => {
        if (moving)
          throw new Error("This flow already owns an active archive move");
        moving = true;
        try {
          const accepted = String(
            object(c.outputs.current ?? c.outputs.no_delta).fingerprint,
          );
          await recheck(target(c), inputs(c), accepted, run, c.signal);
          assertActive(c);
          const destination = await archiveTarget(
            target(c),
            deps.now ?? (() => new Date()),
            (destination) => {
              progress(c).archive.destination = destination;
            },
          );
          assertActive(c);
          await archive(
            target(c),
            destination,
            deps.move ?? move,
            c.signal,
            (state) => {
              progress(c).archive.state = state;
            },
          );
          complete(c, "archive");
          return { ...progress(c).archive };
        } catch (error) {
          const p = progress(c);
          if (p.archive.state === "not_started") p.archive.state = "failed";
          throw error;
        } finally {
          moving = false;
        }
      }),
    }),
    success: compute({
      run: (c) =>
        publish(
          c,
          "success",
          "Synchronization accepted (or not applicable); complete change directory archived and confirmed. No implementation verification performed.",
        ),
    }),
    failed: compute({
      run: (c) =>
        publish(
          c,
          "failed",
          Object.values(c.results)
            .filter((r) => r.outcome !== "ok")
            .map((r) => `${r.nodeId}: ${r.error ?? r.outcome}`)
            .join("; ") || "Finalization failed; earlier edits preserved.",
        ),
    }),
    cancelled: compute({
      run: (c) => {
        progress(c).cancelled = true;
        return publish(
          c,
          "cancelled",
          "Current attempt cancelled; earlier edits preserved.",
        );
      },
    }),
    unsuccessful: compute({
      run: (c) => {
        progress(c).cleanup?.();
        throw new Error(
          `Finalization unsuccessful: ${JSON.stringify(progress(c).emitted)}`,
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
  guarded("preflight", "prepare");
  guarded("prepare", "selection");
  guarded("selection", "selection_route");
  nodes.selection_route = compute({
    run: guardedRun(undefined, (c) => c.outputs.selection),
  });
  edges.push({
    from: "selection_route",
    switch: { on: "$.route", cases: { sync: "sync", no_delta: "no_delta" } },
  });
  guarded("sync", "sync_result");
  guarded("sync_result", "current");
  guarded("current", "assess");
  guarded("assess", "acceptance");
  guarded("acceptance", "archive");
  guarded("no_delta", "archive");
  guarded("archive", "success");
  edges.push(
    { from: "failed", to: "unsuccessful" },
    { from: "cancelled", to: "unsuccessful" },
  );
  return defineFlow({
    name: "openspec-finalize",
    startAt: "preflight",
    nodes,
    edges,
  });
}
