/**
 * bash — AgentFlow example: command-driven orchestration with `af.bash`.
 *
 * Demonstrates the `af.bash(cmd, opts?)` surface: running a shell command,
 * branching on its exit code, and combining command output with a sub-agent
 * step. `af.bash` resolves `{ stdout, stderr, code }` — a non-zero exit is
 * data, not an exception, so the flow branches on `code` instead of try/catch.
 *
 * Copy this file to `.pi/agentflow/bash.ts` (project) to run it with
 * `/af bash`. Use top-level `await` (no wrapper IIFE).
 */

// 1. Capture the working-tree state. `--porcelain` prints one line per changed
//    file, so an empty stdout means a clean tree.
const status = await af.bash("git status --porcelain");

// 2. Branch on the command result with no LLM in the loop.
if (status.code !== 0) {
  // git itself failed (e.g. not a repository) — report it and stop.
  af.result(
    `af.bash: git status failed (exit ${status.code}):\n${status.stderr}`,
  );
} else if (status.stdout.trim() === "") {
  af.result("Working tree is clean — nothing to review.");
} else {
  // 3. Gate a sub-agent step on command output: only review when there are
  //    changes. An optional `timeoutMs` guards a slow command (a timeout
  //    rejects with a `BashTimeoutError` — discriminate by `err.name`).
  let diff: { stdout: string };
  try {
    diff = await af.bash("git diff", { timeoutMs: 10_000 });
  } catch (err) {
    const name = (err as { name?: string }).name;
    af.result(
      name === "BashTimeoutError"
        ? "git diff timed out — skipping review."
        : `git diff failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    diff = { stdout: "" };
  }

  if (diff.stdout) {
    const reviewer = await af.createAgent({
      name: "reviewer",
      systemPrompt: "You are a concise code reviewer. Call out anything risky.",
    });
    const review = await reviewer.sendMessage(
      `Review this uncommitted diff:\n\n${diff.stdout}`,
    );
    reviewer.dispose();
    af.result(`## Uncommitted review\n\n${review}`);
  }
}
