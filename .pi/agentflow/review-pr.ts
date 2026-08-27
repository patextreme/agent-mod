/**
 * review-pr — AgentFlow: loop-review a pull request with a reviewer sub-agent.
 *
 * Drives this loop:
 *   1. A reviewer sub-agent (inheriting the session's model) reviews the PR
 *      using `prompts/review.md` as its instructions.
 *   2. An evaluator sub-agent reads the review text and submits a structured
 *      verdict via `submit_result` (rather than regex over free text).
 *   3. APPROVE           → exit the loop (PR is safe to merge).
 *      REQUEST_CHANGES   → dispatch a fixer sub-agent to edit the code,
 *                          then commit + push the changed files.
 *   4. Repeat until the reviewer approves, or the round cap is hit.
 *
 * Run with `/af review-pr`.
 */

import type { BashResult, FlowAgent } from "./agentflow.d.ts";

const PR_NUMBER_RES = await af.bash("gh pr view --json number --jq .number");
if (PR_NUMBER_RES.code !== 0 || !PR_NUMBER_RES.stdout.trim()) {
  throw new Error(
    `Could not determine PR number: ${
      PR_NUMBER_RES.stderr ||
      PR_NUMBER_RES.stdout ||
      `gh pr view exited ${PR_NUMBER_RES.code}`
    }`,
  );
}
const PR_NUMBER = PR_NUMBER_RES.stdout.trim();
const MAX_ROUNDS = 20;
const REVIEW_PROMPT_PATH = "prompts/review.md";

type Verdict = "approve" | "request-changes";

/** Structured value the evaluator sub-agent submits via `submit_result`. */
interface VerdictResult {
  verdict: Verdict;
  /** The verdict must be one of the two literals declared above. */
  reason?: string;
}

/**
 * The `resultSchema` guard for the evaluator agent. Any value it submits via
 * `submit_result` must match this shape (a literal verdict, optional reason).
 */
const verdictSchema = af.Type.Object({
  verdict: af.Type.Union([
    af.Type.Literal("approve"),
    af.Type.Literal("request-changes"),
  ]),
  reason: af.Type.Optional(af.Type.String()),
});

/**
 * Strip a leading YAML frontmatter block (`---\n…\n---\n`) from a prompt
 * template file so the reviewer agent receives only the instructions.
 */
function stripFrontmatter(text: string): string {
  if (!text.startsWith("---\n")) return text;
  const end = text.indexOf("\n---\n", 4);
  if (end === -1) return text;
  return text.slice(end + "\n---\n".length);
}

/**
 * Load `prompts/review.md` and substitute the PR number for the template's
 * `$ARGUMENTS` placeholder.
 */
async function loadReviewPrompt(): Promise<string> {
  const read = await af.bash(`cat "${REVIEW_PROMPT_PATH}"`);
  if (read.code !== 0) {
    throw new Error(
      `Could not read ${REVIEW_PROMPT_PATH}: ${
        read.stderr || read.stdout || `cat exited ${read.code}`
      }`,
    );
  }
  return stripFrontmatter(read.stdout)
    .trim()
    .split("$ARGUMENTS")
    .join(`#${PR_NUMBER}`);
}

/**
 * Review the PR with a dedicated reviewer sub-agent whose instructions are
 * `prompts/review.md` (with the PR number filled in). Returns the reviewer's
 * free-text review.
 */
async function reviewPR(round: number): Promise<string> {
  const systemPrompt = await loadReviewPrompt();

  const reviewer: FlowAgent = await af.createAgent({
    name: `reviewer:${round}`,
    systemPrompt,
  });

  try {
    return await reviewer.sendMessage(
      `Review pull request #${PR_NUMBER} and report your findings.`,
    );
  } finally {
    reviewer.dispose();
  }
}

/**
 * Determine the verdict for a review run by delegating to a dedicated
 * evaluator sub-agent that reads the free-text review and submits a
 * structured verdict via `submit_result`. This avoids brittle regex over
 * the reviewer's prose.
 */
async function evaluateVerdict(
  reviewText: string,
  round: number,
): Promise<Verdict> {
  const evaluator: FlowAgent<VerdictResult> = await af.createAgent({
    name: `evaluator:${round}`,
    resultSchema: verdictSchema,
    systemPrompt:
      "You are a code-review adjudicator. You will be given the free-text " +
      "output of a reviewer that followed an instruction template to review " +
      "the pull request (read the diff, then the full files, and focus on " +
      "bugs, security, structure, performance, and behavior changes). " +
      'Determine the verdict: "request-changes" only when the review reports ' +
      "at least one definite, actionable defect the author should fix before " +
      "merge — a real bug, security issue, broken error handling, or an " +
      "unintended behavior change. Pure style preferences, nits, and " +
      '"consider" suggestions must not block approval. Return "approve" when ' +
      "the review has no must-fix defect. Use the submit_result tool to " +
      "return a JSON object of the shape { verdict, reason? }.",
  });

  try {
    await evaluator.sendMessage(
      `Below is the review text for PR #${PR_NUMBER} (round ${round}). ` +
        `Determine the verdict and submit it via submit_result.\n\n${reviewText}`,
    );
    const submitted = evaluator.submittedResult();

    if (submitted?.verdict) {
      return submitted.verdict;
    }
    throw new Error(
      `Round ${round}: evaluator did not submit a verdict via submit_result`,
    );
  } finally {
    evaluator.dispose();
  }
}

/**
 * Parse one porcelain path token. `git status --porcelain` quotes paths that
 * contain spaces/non-ASCII and escapes the same characters as C strings, so
 * stripping only the surrounding quotes is lossy for real filenames.
 */
function parsePorcelainPath(raw: string): string {
  if (!(raw.startsWith('"') && raw.endsWith('"'))) return raw;
  return raw.slice(1, -1).replace(/\\([\\"nt])/g, (_match, c: string) => {
    if (c === "n") return "\n";
    if (c === "t") return "\t";
    return c;
  });
}

/**
 * Parse `git status --porcelain` output into the set of changed paths.
 * Rename/copy entries ("XY old -> new") only split on the arrow when the
 * status-code prefix actually denotes a rename/copy; an untracked file whose
 * name contains " -> " must remain one path.
 */
function porcelainChangedPaths(out: string): Set<string> {
  const paths = new Set<string>();
  for (const line of out.split("\n")) {
    if (line.length < 4) continue;
    const status = line.slice(0, 2);
    const renameOrCopy = status[0] === "R" || status[0] === "C";
    let path = line.slice(3);
    if (renameOrCopy) {
      // Find the rename arrow outside of any quoted half of the entry.
      let quoted = false;
      let escaped = false;
      for (let i = 0; i < path.length - 3; i++) {
        const c = path[i];
        if (escaped) {
          escaped = false;
          continue;
        }
        if (c === "\\") {
          escaped = true;
          continue;
        }
        if (c === '"') {
          quoted = !quoted;
          continue;
        }
        if (
          !quoted &&
          c === " " &&
          path[i + 1] === "-" &&
          path[i + 2] === ">" &&
          path[i + 3] === " "
        ) {
          path = path.slice(i + 4);
          break;
        }
      }
    }
    paths.add(parsePorcelainPath(path));
  }
  return paths;
}

/**
 * Deterministic pre-commit quality gate. A fixer's edits are committed and
 * pushed only when the project's verify gates pass: `npm run typecheck` and
 * `npm test`. (Format/lint need `biome`, only guaranteed inside `nix develop`,
 * so they are not a hard gate here.) Returns whether the gate passed plus a
 * concise report for the result message.
 */
async function runQualityGate(
  round: number,
): Promise<{ ok: boolean; detail: string }> {
  af.log(`Round ${round}: quality gate — typecheck and tests must pass`);

  const lines: string[] = [];
  async function run(label: string, cmd: string): Promise<boolean> {
    let res: BashResult;
    try {
      res = await af.bash(cmd, { timeoutMs: 10 * 60 * 1000 });
    } catch (err) {
      if (af.isBashTimeoutError(err)) {
        lines.push(`${label}: FAIL (timed out)`);
        return false;
      }
      throw err;
    }
    if (res.code === 0) {
      lines.push(`${label}: PASS`);
      return true;
    }
    lines.push(
      `${label}: FAIL (exit ${res.code})\n${(res.stdout + res.stderr).slice(-3000)}`.trimEnd(),
    );
    return false;
  }

  const typecheckOk = await run("typecheck", "npm run typecheck");
  let testOk = false;
  if (typecheckOk) {
    testOk = await run("test", "npm test");
  } else {
    lines.push("test: SKIPPED (typecheck failed)");
  }

  return { ok: typecheckOk && testOk, detail: lines.join("\n") };
}

/**
 * Commit and push the fixer's changes. Returns an error title/message string
 * on the first failing git step, or `undefined` when all three steps pass.
 */
async function commitAndPush(round: number): Promise<string | undefined> {
  const addRes = await af.bash("git add --all");
  if (addRes.code !== 0) {
    return `## git add failed\n\n${addRes.stderr}`;
  }

  const commitRes = await af.bash(
    `git commit -m "fix: address code review feedback (round ${round})"`,
  );
  if (commitRes.code !== 0) {
    return `## git commit failed\n\n${commitRes.stderr}`;
  }

  const pushRes = await af.bash("git push");
  if (pushRes.code !== 0) {
    return `## git push failed\n\n${pushRes.stderr}`;
  }

  return undefined;
}

async function drive() {
  const branchRes = await af.bash("git branch --show-current");
  if (branchRes.code !== 0 || !branchRes.stdout.trim()) {
    af.result(
      `## ⚠️ Could not determine current branch\n\n` +
        `\`git branch --show-current\` failed (exit ${branchRes.code}):\n\n` +
        `\`\`\`\n${(branchRes.stdout + branchRes.stderr).trim()}\n\`\`\``,
    );
    return;
  }
  const branch = branchRes.stdout.trim();
  af.log(
    `PR #${PR_NUMBER} on branch '${branch}' — up to ${MAX_ROUNDS} review rounds.`,
  );

  // The loop commits and pushes whatever the fixer touches, so it must start
  // from a clean tree: otherwise unrelated local edits could be swept into the
  // PR commit, or an already-dirty file the fixer also edits could not be
  // attributed to the fixer. Refuse to run until the tree is clean.
  const precheck = await af.bash("git status --porcelain");
  if (precheck.code !== 0) {
    af.result(
      `## ⚠️ Could not check working tree state\n\n` +
        `\`git status --porcelain\` failed with exit code ${precheck.code}:\n\n` +
        `\`\`\`\n${(precheck.stdout + precheck.stderr).trim()}\n\`\`\``,
    );
    return;
  }
  if (precheck.stdout.trim() !== "") {
    af.result(
      `## ⚠️ Working tree is not clean\n\n` +
        `Refusing to run the review-fix loop because \`git status --porcelain\` reports ` +
        `uncommitted changes. Commit or stash them first so the fixer's edits can be ` +
        `committed and pushed unambiguously.\n\n` +
        `\`\`\`\n${precheck.stdout}\n\`\`\``,
    );
    return;
  }

  let lastText = "";

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    af.log(
      `Round ${round}/${MAX_ROUNDS}: reviewer reviewing PR #${PR_NUMBER}…`,
    );

    const reviewText = await reviewPR(round);
    lastText = reviewText;
    af.log(`Round ${round}: review produced ${reviewText.length} characters.`);

    const verdict = await evaluateVerdict(reviewText, round);
    af.log(`Round ${round}: verdict = ${verdict}`);

    if (verdict === "approve") {
      af.log("Reviewer approved — exiting the loop.");
      af.result(
        `## ✅ Reviewer approved PR #${PR_NUMBER}\n\n` +
          `Approved after ${round} round(s) on branch \`${branch}\`. The PR is ready to merge.\n\n` +
          `<details><summary>Final review text</summary>\n\n${reviewText}\n\n</details>`,
      );
      return;
    }

    // REQUEST_CHANGES: fix, commit, push.
    af.log(
      `Round ${round}: reviewer requested changes. Dispatching a fixer agent…`,
    );

    const fixer: FlowAgent = await af.createAgent({
      name: `fixer:${round}`,
      systemPrompt:
        "You are a senior software engineer fixing code-review findings in the " +
        "`agent-mod` repository (a pi coding-agent extension package: extensions " +
        "for permission/tps/agentflow plus prompt templates; no build step, " +
        "`tsc --noEmit` only, biome for format/lint). Read AGENTS.md and the " +
        "relevant files before editing. Make minimal, targeted edits that " +
        "address only the definite, must-fix defects the reviewer raised (real " +
        "bugs, security issues, broken error handling, unintended behavior " +
        "changes); ignore pure style/nit suggestions. Do NOT run git " +
        "add/commit/push — the orchestrator commits your edits. You may run read-only checks such as " +
        "`npm run typecheck` or `npm test` to verify.",
    });

    try {
      const fixSummary = await fixer.sendMessage(
        `A reviewer reviewed PR #${PR_NUMBER} (branch \`${branch}\`) and requested changes. ` +
          `Here is the review:\n\n${reviewText}\n\n` +
          `Fix the definite, must-fix defects the review raises (real bugs, ` +
          `security issues, broken error handling, unintended behavior ` +
          `changes). Ignore pure style/nit suggestions, then reply with a ` +
          `short summary of exactly which files you changed and why.`,
      );
      af.log(`Round ${round} fixer: ${fixSummary.slice(0, 400)}`);
    } finally {
      fixer.dispose();
    }

    // The tree was verified clean before the loop, so anything dirty now is the
    // fixer's own work. Commit all of it (tracked + untracked) rather than
    // diffing paths, which silently dropped already-dirty files the fixer also
    // touched.
    const afterStatus = await af.bash("git status --porcelain");
    if (afterStatus.code !== 0) {
      af.log(
        `Round ${round}: git status failed after fixer — cannot verify changes.`,
      );
      af.result(
        `## ❌ Could not verify fixer changes (round ${round})\n\n` +
          `\`git status --porcelain\` failed with exit code ${afterStatus.code}:\n\n` +
          `\`\`\`\n${(afterStatus.stdout + afterStatus.stderr).trim()}\n\`\`\``,
      );
      return;
    }
    const changedPaths = porcelainChangedPaths(afterStatus.stdout);

    if (changedPaths.size === 0) {
      af.log(
        `Round ${round}: fixer made no changes to the tree — cannot progress. Stopping.`,
      );
      af.result(
        `## ⚠️ Stuck (round ${round})\n\nThe reviewer requested changes but the fixer did not modify any files.\n\nRequested fixes:\n\n${reviewText}`,
      );
      return;
    }

    // Deterministic gate: refuse to commit/push unless typecheck and tests pass.
    const gate = await runQualityGate(round);
    if (!gate.ok) {
      af.log(
        `Round ${round}: quality gate FAILED — leaving changes uncommitted.`,
      );
      af.result(
        `## ❌ Fix rejected by quality gate (round ${round})\n\n` +
          `The fixer's changes do not pass the project's verify gates, so they ` +
          `were left uncommitted for manual review (not pushed).\n\n${gate.detail}`,
      );
      return;
    }

    const gitError = await commitAndPush(round);
    if (gitError) {
      af.log(gitError.replace(/^##\s*/, ""));
      af.result(gitError);
      return;
    }

    af.log(
      `Round ${round}: committed + pushed ${changedPaths.size} file(s): ${[...changedPaths.keys()].join(", ")}`,
    );
  }

  af.result(
    `## ⏳ Still not approved after ${MAX_ROUNDS} round(s)\n\n` +
      `The reviewer kept requesting changes after ${MAX_ROUNDS} fix rounds. Latest review:\n\n${lastText}`,
  );
}

await drive();
