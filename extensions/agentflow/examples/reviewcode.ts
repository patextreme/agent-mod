/**
 * reviewcode — starter AgentFlow example.
 *
 * Copy this file to `.pi/agentflow/reviewcode.ts` (project) to run it with
 * `/af reviewcode`. It demonstrates the `af` surface: `af.createAgent`,
 * sequential `sendMessage` steps, `af.log`, and `af.result`.
 *
 * The file uses top-level `await` (no wrapper IIFE): the AgentFlow runtime
 * executes the script body inside its own async function, so do not wrap the
 * body in an additional async IIFE — doing so would detach the flow from the
 * runtime's completion signal and the run would finish before doing any work.
 */

const reviewer = await af.createAgent({
  name: "reviewer",
  systemPrompt: "You are a senior code reviewer. Be concise and concrete.",
});

const styleCoach = await af.createAgent({
  name: "style",
  systemPrompt: "You focus on style, naming, and maintainability.",
});

af.log("Asking reviewer to review src/core.ts");
const review = await reviewer.sendMessage(
  "Review src/core.ts for correctness and edge cases.",
);

af.log("Asking style coach to assess the same file");
const style = await styleCoach.sendMessage(
  "Assess the style and naming of src/core.ts.",
);

af.result(`## Code Review

### Correctness
${review}

### Style
${style}`);
