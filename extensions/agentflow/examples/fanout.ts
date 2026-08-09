/**
 * fanout — AgentFlow example: structured results + loop control + fan-out.
 *
 * Demonstrates the `resultSchema` / `submit_result` / `submittedResult()` /
 * `clearResult()` surface. A planner agent submits a list of steps; each step
 * is fanned out to a parallel worker that submits a structured output; the
 * flow aggregates them. `clearResult()` is used per iteration so no stale
 * value is ever read as the current turn's answer.
 *
 * Copy this file to `.pi/agentflow/fanout.ts` (project) to run it with
 * `/af fanout`. Use top-level `await` (no wrapper IIFE).
 */

const planner = await af.createAgent({
  name: "planner",
  systemPrompt: "You break tasks into discrete, self-contained steps.",
  resultSchema: af.Type.Object({ steps: af.Type.Array(af.Type.String()) }),
});

af.log("Asking planner to break the task into steps");
await planner.sendMessage(
  "Break 'ship a release notes page' into 3 concrete steps and submit { steps }.",
);
const steps = planner.submittedResult()?.steps ?? [];
af.log(`Planner proposed ${steps.length} steps`);

// Fan out: one worker per step, each submits a structured output.
const workers = await Promise.all(
  steps.map(async (step) => {
    const worker = await af.createAgent({
      name: `worker:${step.slice(0, 12)}`,
      systemPrompt: "You execute one step and submit a concise { output }.",
      resultSchema: af.Type.Object({ output: af.Type.String() }),
    });
    af.log(`Worker running: ${step}`);
    await worker.sendMessage(
      `Execute this step and submit { output }: ${step}`,
    );
    return worker.submittedResult()?.output ?? "";
  }),
);

af.result(
  `## Fan-out results\n\n${workers.map((w, i) => `### Step ${i + 1}\n${w}`).join("\n\n")}`,
);
