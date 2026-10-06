import type {
  FlowDefinition,
  FlowNodeContext,
  FlowNodeDefinition,
  ShellActionResult,
} from "acpx/flows";

export interface ScopedCallback {
  stage: string;
  /** The constituent graph's local node identifier. */
  nodeId: string;
  surface: "run" | "exec" | "cwd" | "prompt" | "parse";
}

/**
 * Observers receive the real native context; invoke runs the original callback
 * with its stage-local view. Preserve T (including promises) and invoke once.
 * This is an attempt-observation seam, not a parent-run cancellation signal.
 */
export type ScopedCallbackWrapper = <T>(
  context: FlowNodeContext,
  invoke: () => T,
  callback: ScopedCallback,
) => T;

/** Compose native definitions without a nested runner or shared stage history. */
export function scopeGraph(
  stage: string,
  graph: FlowDefinition,
  wrap?: ScopedCallbackWrapper,
): FlowDefinition {
  if (!/^[a-zA-Z0-9_-]+$/.test(stage))
    throw new Error("Stage must be a nonempty namespace without ':'");
  const prefix = `${stage}:`;
  const ids = new Map(
    Object.keys(graph.nodes).map((id) => [id, `${prefix}${id}`]),
  );
  const localIds = new Map([...ids].map(([local, scoped]) => [scoped, local]));
  const scopedId = (id: string): string => {
    const scoped = ids.get(id);
    if (scoped === undefined) throw new Error(`Unknown ${stage} node: ${id}`);
    return scoped;
  };
  const localId = (id: string | undefined) =>
    id === undefined ? undefined : localIds.get(id);
  const localAttempt = (id: string | undefined) =>
    id?.startsWith(prefix) ? id.slice(prefix.length) : undefined;
  const scopedAttempt = (id: string) =>
    [...ids.keys()].some((nodeId) => id.startsWith(`${nodeId}#`))
      ? `${prefix}${id}`
      : id;
  const projectValues = <T>(values: Record<string, T>) =>
    Object.fromEntries(
      Object.entries(values)
        .filter(([id]) => localIds.has(id))
        .map(([id, value]) => [localId(id), value]),
    );
  const projectResults = (results: FlowNodeContext["results"]) =>
    Object.fromEntries(
      Object.entries(results)
        .filter(([id]) => localIds.has(id))
        .map(([id, result]) => [
          localId(id),
          {
            ...result,
            nodeId: localId(result.nodeId),
            attemptId: localAttempt(result.attemptId),
          },
        ]),
    ) as FlowNodeContext["results"];

  function project(context: FlowNodeContext): FlowNodeContext {
    // Live getters retain native state observation during async work/abort
    // listeners, without mutating the parent's persisted namespaced records.
    const state: FlowNodeContext["state"] = {
      ...context.state,
      flowName: graph.name,
      get outputs() {
        return projectValues(context.state.outputs);
      },
      get results() {
        return projectResults(context.state.results);
      },
      get steps() {
        return context.state.steps
          .filter((step) => localIds.has(step.nodeId))
          .map((step) => ({
            ...step,
            nodeId: localId(step.nodeId) as string,
            attemptId: localAttempt(step.attemptId) as string,
          }));
      },
      get currentNode() {
        return localId(context.state.currentNode);
      },
      get currentAttemptId() {
        return localId(context.state.currentNode) === undefined
          ? undefined
          : localAttempt(context.state.currentAttemptId);
      },
      get waitingOn() {
        return localId(context.state.waitingOn);
      },
    };
    return {
      ...context,
      state,
      get outputs() {
        return projectValues(context.outputs);
      },
      get results() {
        return projectResults(context.results);
      },
    };
  }

  const nodes = Object.fromEntries(
    Object.entries(graph.nodes).map(([nodeId, original]) => {
      const call = <T>(
        surface: ScopedCallback["surface"],
        context: FlowNodeContext,
        invoke: (local: FlowNodeContext) => T,
      ): T => {
        const scoped = () => invoke(project(context));
        return wrap
          ? wrap(context, scoped, { stage, nodeId, surface })
          : scoped();
      };
      let node: FlowNodeDefinition;
      switch (original.nodeType) {
        case "acp": {
          const cwd = original.cwd;
          const parse = original.parse;
          node = {
            ...original,
            cwd: typeof cwd === "function" ? (c) => call("cwd", c, cwd) : cwd,
            prompt: (c) => call("prompt", c, original.prompt),
            ...(parse && {
              parse: (text: string, c: FlowNodeContext) =>
                call("parse", c, (local) => parse(text, local)),
            }),
          };
          break;
        }
        case "action": {
          if ("exec" in original) {
            const parse = original.parse;
            node = {
              ...original,
              exec: (c) => call("exec", c, original.exec),
              ...(parse && {
                parse: (result: ShellActionResult, c: FlowNodeContext) =>
                  call("parse", c, (local) => parse(result, local)),
              }),
            };
          } else {
            node = { ...original, run: (c) => call("run", c, original.run) };
          }
          break;
        }
        case "compute":
          node = { ...original, run: (c) => call("run", c, original.run) };
          break;
        case "checkpoint": {
          const run =
            original.run ??
            (() => ({
              checkpoint: nodeId,
              summary: original.summary ?? nodeId,
            }));
          node = { ...original, run: (c) => call("run", c, run) };
          break;
        }
      }
      return [scopedId(nodeId), node];
    }),
  );
  const edges = graph.edges.map((edge) => {
    // acpx 0.19.4 accepts extension properties but never evaluates edge.when.
    // Reject it rather than imply that an ignored safety predicate is enforced.
    if (Object.hasOwn(edge, "when"))
      throw new Error("Installed acpx does not support edge.when callbacks");
    if ("to" in edge)
      return { ...edge, from: scopedId(edge.from), to: scopedId(edge.to) };
    return {
      ...edge,
      from: scopedId(edge.from),
      switch: {
        ...edge.switch,
        cases: Object.fromEntries(
          Object.entries(edge.switch.cases).map(([key, to]) => [
            edge.switch.on === "$result.nodeId"
              ? scopedId(key)
              : edge.switch.on === "$result.attemptId"
                ? scopedAttempt(key)
                : key,
            scopedId(to),
          ]),
        ),
      },
    };
  });
  const title = graph.run?.title;
  return {
    ...graph,
    name: `${prefix}${graph.name}`,
    ...(typeof title === "function" && {
      run: {
        ...graph.run,
        title: (c) => title({ ...c, flowName: graph.name }),
      },
    }),
    startAt: scopedId(graph.startAt),
    nodes,
    edges,
  };
}
