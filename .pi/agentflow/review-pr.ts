/**
 * review-pr — AgentFlow: loop-review a pull request with the Claude CLI.
 *
 * Drives this loop:
 *   1. Run `claude -p "/code-review <PR>"` (stream-json) to review the PR
 *      with Claude Code's built-in `/code-review` slash command.
 *   2. An evaluator sub-agent reads the review text and submits a structured
 *      verdict via `submit_result` (rather than regex over free text).
 *   3. APPROVE           → exit the loop (PR is safe to merge).
 *      REQUEST_CHANGES   → dispatch a fixer sub-agent to edit the code,
 *                          then commit + push the changed files.
 *   4. Repeat until Claude approves, or the round cap is hit.
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
const CLAUDE_DIR = "/tmp/agentflow-review-pr";
const CLAUDE_RESULT = `${CLAUDE_DIR}/claude-result.json`;
const CLAUDE_ERROR = `${CLAUDE_DIR}/claude-error.log`;
const REVIEW_TIMEOUT_MS = 20 * 60 * 1000; // Claude review can take a while.

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
 * Determine the verdict for a `/code-review` run by delegating to a dedicated
 * evaluator sub-agent that reads the free-text review and submits a
 * structured verdict via `submit_result`. This avoids brittle regex over
 * Claude's prose.
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
      "output of Claude Code's built-in /code-review command. Determine the " +
      'verdict from it: "approve" when the review finds no issues or only ' +
      'benign/style nits; "request-changes" when it lists any real bug, ' +
      "correctness risk, or required change. Use the submit_result tool to " +
      "return a JSON object of the shape { verdict, reason? }.",
  });

  await evaluator.sendMessage(
    `Below is the review text for PR #${PR_NUMBER} (round ${round}). ` +
      `Determine the verdict and submit it via submit_result.\n\n${reviewText}`,
  );
  const submitted = evaluator.submittedResult();
  evaluator.dispose();

  if (submitted?.verdict) {
    return submitted.verdict;
  }
  throw new Error(
    `Round ${round}: evaluator did not submit a verdict via submit_result`,
  );
}

/**
 * Parse `git status --porcelain` output into the set of changed paths.
 * Handles rename entries ("XY old -> new") by taking the new path.
 */
function porcelainChangedPaths(out: string): Set<string> {
  const paths = new Set<string>();
  for (const line of out.split("\n")) {
    if (line.length < 4) continue;
    let path = line.slice(3);
    const arrow = path.indexOf(" -> ");
    if (arrow !== -1) path = path.slice(arrow + 4);
    path = path.replace(/^"(.*)"$/, "$1"); // strip porcelain quoting
    paths.add(path);
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
  const branch = (await af.bash("git branch --show-current")).stdout.trim();
  af.log(
    `PR #${PR_NUMBER} on branch '${branch}' — up to ${MAX_ROUNDS} review rounds.`,
  );

  // The loop commits and pushes whatever the fixer touches, so it must start
  // from a clean tree: otherwise unrelated local edits could be swept into the
  // PR commit, or an already-dirty file the fixer also edits could not be
  // attributed to the fixer. Refuse to run until the tree is clean.
  const precheck = await af.bash("git status --porcelain");
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

  // Claude Code's builtin /code-review slash command: it runs `gh pr view` /
  // `gh pr diff` and analyzes the diff itself. Use `--output-format json` and
  // parse the single structured result object directly instead of grepping
  // stream-json events from a mixed stdout/stderr log.
  const REVIEW_CMD = `
set +e
mkdir -p ${CLAUDE_DIR}
claude -p "/code-review ${PR_NUMBER}" --dangerously-skip-permissions --setting-sources "" \
  --output-format json \
  > ${CLAUDE_RESULT} 2> ${CLAUDE_ERROR}
code=$?
printf 'CLAUDE_EXIT=%s\\n' "$code"
if [ -s ${CLAUDE_RESULT} ] && jq -e . ${CLAUDE_RESULT} >/dev/null 2>&1; then
  jq -c '{is_error: (.is_error // false), result: (.result // "")}' ${CLAUDE_RESULT}
else
  printf 'CLAUDE_JSON_PARSE_ERROR=true\\n'
  tail -c 4000 ${CLAUDE_RESULT} 2>/dev/null || true
  tail -c 4000 ${CLAUDE_ERROR} 2>/dev/null || true
fi
`;

  let lastText = "";

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    af.log(
      `Round ${round}/${MAX_ROUNDS}: running Claude review of PR #${PR_NUMBER}…`,
    );

    let res: BashResult | undefined;
    try {
      res = await af.bash(REVIEW_CMD, { timeoutMs: REVIEW_TIMEOUT_MS });
    } catch (err) {
      // `isBashTimeoutError` narrows the `unknown` catch clause to
      // `BashTimeoutError`, exposing `.stdout`/`.stderr`.
      if (af.isBashTimeoutError(err)) {
        af.log(`Round ${round}: Claude review timed out — stopping.`);
        af.result(
          `## Claude review timed out\n\nStopped during round ${round}.`,
        );
        return;
      }
      throw err;
    }

    const rawText = res.stdout;
    lastText = rawText;

    const exitMatch = rawText.match(/CLAUDE_EXIT=(\d+)/);
    const claudeExit = exitMatch ? Number(exitMatch[1]) : null;

    let reviewText = "";
    let isError = false;
    let parseError = /CLAUDE_JSON_PARSE_ERROR=true/.test(rawText);
    const jsonLine = rawText.split("\n").find((line) => line.startsWith("{"));
    if (jsonLine !== undefined) {
      try {
        const parsed = JSON.parse(jsonLine) as {
          is_error?: boolean;
          result?: string;
        };
        isError = parsed.is_error === true;
        reviewText = (parsed.result ?? "").trim();
      } catch {
        parseError = true;
      }
    } else {
      parseError = true;
    }

    if (
      claudeExit === null ||
      claudeExit !== 0 ||
      isError ||
      parseError
    ) {
      af.log(
        `Round ${round}: Claude CLI failed (claude exit=${claudeExit}, is_error=${isError}, json_parse_error=${parseError}). Stopping.`,
      );
      af.result(
        `## Claude review failed in round ${round}\n\nclaude exit=${claudeExit}, is_error=${isError}, json_parse_error=${parseError}\n\nRaw tail:\n\n${rawText.slice(-4000)}`,
      );
      return;
    }

    const verdict = await evaluateVerdict(reviewText, round);
    af.log(`Round ${round}: verdict = ${verdict}`);

    if (verdict === "approve") {
      af.log("Claude approved — exiting the loop.");
      af.result(
        `## ✅ Claude approved PR #${PR_NUMBER}\n\n` +
          `Approved after ${round} round(s) on branch \`${branch}\`. The PR is ready to merge.\n\n` +
          `<details><summary>Final review text</summary>\n\n${reviewText}\n\n</details>`,
      );
      return;
    }

    // REQUEST_CHANGES: fix, commit, push.
    af.log(
      `Round ${round}: Claude requested changes. Dispatching a fixer agent…`,
    );

    const fixer: FlowAgent = await af.createAgent({
      name: `fixer:${round}`,
      systemPrompt:
        "You are a senior software engineer fixing code-review findings in the " +
        "`agent-mod` repository (a pi coding-agent extension package: extensions " +
        "for permission/tps/agentflow plus prompt templates; no build step, " +
        "`tsc --noEmit` only, biome for format/lint). Read AGENTS.md and the " +
        "relevant files before editing. Make minimal, targeted edits that " +
        "address each legitimate issue. Do NOT run git add/commit/push — the " +
        "orchestrator commits your edits. You may run read-only checks such as " +
        "`npm run typecheck` or `npm test` to verify.",
    });

    const fixSummary = await fixer.sendMessage(
      `Claude reviewed PR #${PR_NUMBER} (branch \`${branch}\`) and requested changes. ` +
        `Here is the review:\n\n${reviewText}\n\n` +
        `Fix every legitimate issue in the working tree, then reply with a short ` +
        `summary of exactly which files you changed and why.`,
    );
    af.log(`Round ${round} fixer: ${fixSummary.slice(0, 400)}`);
    fixer.dispose();

    // The tree was verified clean before the loop, so anything dirty now is the
    // fixer's own work. Commit all of it (tracked + untracked) rather than
    // diffing paths, which silently dropped already-dirty files the fixer also
    // touched.
    const afterStatus = await af.bash("git status --porcelain");
    const changedPaths = porcelainChangedPaths(afterStatus.stdout);

    if (changedPaths.size === 0) {
      af.log(
        `Round ${round}: fixer made no changes to the tree — cannot progress. Stopping.`,
      );
      af.result(
        `## ⚠️ Stuck (round ${round})\n\nClaude requested changes but the fixer did not modify any files.\n\nRequested fixes:\n\n${reviewText}`,
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
      `Claude kept requesting changes after ${MAX_ROUNDS} fix rounds. Latest review:\n\n${lastText}`,
  );
}

await drive();
