/**
 * fresh-context — AgentFlow example: a NEW agent per iteration.
 *
 * Contrast with `reviewcode.ts` (reuse one handle, shared conversation) and
 * `fanout.ts` (one agent per fan-out branch). This demonstrates the other
 * loop pattern: instead of reusing a single `createAgent` handle and calling
 * `clearResult()` per turn, create a brand-new agent on every iteration so
 * each round is fully isolated — no leftover context from earlier turns.
 *
 * When to pick which:
 * - Reuse one handle   → rounds share conversation history (the agent "remembers"
 *   earlier rounds). Combine with `clearResult()` for result freshness.
 * - New agent per turn → each round starts cold, context completely fresh.
 *   Use when a round's answer must not be colored by prior rounds, e.g.
 *   independent samples, retries of a flaky task, or unbiased votes.
 *
 * Copy this file to `.pi/agentflow/fresh-context.ts` (project) to run it with
 * `/af fresh-context`. Use top-level `await` (no wrapper IIFE).
 */

const rounds = 3;
const verdicts: string[] = [];

for (let round = 0; round < rounds; round++) {
  // Fresh handle every iteration: this agent exists for exactly one turn.
  const judge = await af.createAgent<{ accepts: boolean; reason: string }>({
    name: `judge:${round + 1}`,
    systemPrompt:
      "You are an independent reviewer. Judge only what is in this turn; ignore any prior context.",
    resultSchema: af.Type.Object({
      accepts: af.Type.Boolean(),
      reason: af.Type.String(),
    }),
  });

  af.log(`Round ${round + 1}: asking a fresh judge`);
  const text = await judge.sendMessage(
    "Review the proposal and submit { accepts, reason }.",
  );

  const verdict = judge.submittedResult();
  verdicts.push(
    `Round ${round + 1}: ${verdict?.accepts ? "ACCEPT" : "REJECT"} — ${verdict?.reason ?? text}`,
  );

  // No clearResult() needed: the handle is discarded after use.
  judge.dispose();
}

af.result(`## Independent verdicts\n\n${verdicts.join("\n")}`);