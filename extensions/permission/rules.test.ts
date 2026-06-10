import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findMatchingRule, PERMISSION_RULES } from "./rules.js";

// Helper: check that a command matches the expected rule id and action
function assertRule(
  command: string,
  expectedId: number,
  expectedAction: string,
) {
  const rule = findMatchingRule(command);
  assert.ok(rule, `Expected rule match for: ${command}`);
  assert.strictEqual(
    rule.id,
    expectedId,
    `Expected rule ${expectedId} for: ${command}, got rule ${rule.id}`,
  );
  assert.strictEqual(rule.action, expectedAction, `For command: ${command}`);
}

function assertNoRule(command: string) {
  const rule = findMatchingRule(command);
  assert.strictEqual(
    rule,
    undefined,
    `Expected no rule match for: ${command}, got rule ${rule?.id}`,
  );
}

describe("permission rules", () => {
  // --- Rule ordering invariant ---
  it("rules are ordered by id and first-match semantics apply", () => {
    const ids = PERMISSION_RULES.map((r) => r.id);
    const sorted = [...ids].sort((a, b) => a - b);
    assert.deepEqual(ids, sorted, "Rules must be ordered by id");
  });

  // --- git commands (rules 1-3: ask) ---
  it("git commit triggers ask", () => {
    assertRule("git commit -m 'feat: add stuff'", 1, "ask");
  });

  it("git push triggers ask", () => {
    assertRule("git push origin main", 2, "ask");
  });

  it("git push --force triggers ask", () => {
    assertRule("git push --force origin main", 2, "ask");
  });

  it("git rebase triggers ask", () => {
    assertRule("git rebase main", 3, "ask");
  });

  describe("rules 1-3 word boundary (no false positives from English words)", () => {
    it('"digital" does not trigger rule 1', () => {
      assertNoRule('echo "digital commit"');
    });

    it('"magnet" does not trigger rule 2', () => {
      assertNoRule('echo "magnet push"');
    });

    it('"fugitive" does not trigger rule 3', () => {
      assertNoRule('echo "fugitive rebase"');
    });
  });

  // --- gh read-only subcommands (rules 4-18: allow) ---
  it("gh repo view is allowed", () => {
    assertRule("gh repo view owner/repo", 4, "allow");
  });

  it("gh repo list is allowed", () => {
    assertRule("gh repo list", 5, "allow");
  });

  it("gh issue view is allowed", () => {
    assertRule("gh issue view 42", 6, "allow");
  });

  it("gh issue list is allowed", () => {
    assertRule("gh issue list", 7, "allow");
  });

  it("gh pr view is allowed", () => {
    assertRule("gh pr view 7", 8, "allow");
  });

  it("gh pr list is allowed", () => {
    assertRule("gh pr list", 9, "allow");
  });

  it("gh pr checks is allowed", () => {
    assertRule("gh pr checks 7", 10, "allow");
  });

  it("gh pr diff is allowed", () => {
    assertRule("gh pr diff 7", 11, "allow");
  });

  it("gh release view is allowed", () => {
    assertRule("gh release view v1.0", 12, "allow");
  });

  it("gh release list is allowed", () => {
    assertRule("gh release list", 13, "allow");
  });

  it("gh workflow view is allowed", () => {
    assertRule("gh workflow view 123", 14, "allow");
  });

  it("gh workflow list is allowed", () => {
    assertRule("gh workflow list", 15, "allow");
  });

  it("gh run view is allowed", () => {
    assertRule("gh run view 456", 16, "allow");
  });

  it("gh run list is allowed", () => {
    assertRule("gh run list", 17, "allow");
  });

  it("gh run watch is allowed", () => {
    assertRule("gh run watch 456", 18, "allow");
  });

  // --- gh search (rule 19: allow) ---
  describe("gh search (rule 19: allow)", () => {
    it("gh search repos is allowed", () => {
      assertRule("gh search repos my-query", 19, "allow");
    });

    it("gh search issues is allowed", () => {
      assertRule("gh search issues bug", 19, "allow");
    });

    it("gh search prs is allowed", () => {
      assertRule("gh search prs feature", 19, "allow");
    });

    it('"searching" does not trigger rule 19 (word boundary)', () => {
      assertNoRule('echo "searching for files"');
    });
  });

  // --- gh api read-only (rules 20-21: allow) ---
  describe("gh api read-only (rule 20: explicit GET)", () => {
    it("gh api with --method GET is allowed", () => {
      assertRule("gh api /repos/owner/repo --method GET", 20, "allow");
    });

    it("gh api with -X GET is allowed", () => {
      assertRule("gh api /repos/owner/repo -X GET", 20, "allow");
    });

    it("gh api with --method GET and body flags is still allowed (explicit GET overrides)", () => {
      assertRule(
        "gh api /repos/owner/repo --method GET -f key=value",
        20,
        "allow",
      );
    });

    it("gh api with --method GET and -F body flag is still allowed", () => {
      assertRule(
        "gh api /repos/owner/repo --method GET -F key=value",
        20,
        "allow",
      );
    });

    it("gh api with --method GET and --field flag is still allowed", () => {
      assertRule(
        "gh api /repos/owner/repo --method GET --field key=value",
        20,
        "allow",
      );
    });

    it("gh api with --method GET and --raw-field flag is still allowed", () => {
      assertRule(
        "gh api /repos/owner/repo --method GET --raw-field key=value",
        20,
        "allow",
      );
    });

    it("gh api with --method=GET (equals sign) is allowed", () => {
      assertRule("gh api /repos/owner/repo --method=GET", 20, "allow");
    });

    it("gh api with -XGET (concatenated) is allowed", () => {
      assertRule("gh api /repos/owner/repo -XGET", 20, "allow");
    });
  });

  describe("gh api read-only (rule 21: implicit GET, no body flags)", () => {
    it("gh api with just endpoint is allowed", () => {
      assertRule("gh api /repos/owner/repo", 21, "allow");
    });

    it("gh api with query params in URL is allowed", () => {
      assertRule("gh api /repos/owner/repo?per_page=10", 21, "allow");
    });

    it("gh api with --jq flag is allowed (no body flag)", () => {
      assertRule("gh api /repos/owner/repo --jq .name", 21, "allow");
    });

    it("gh api with --paginate flag is allowed (no body flag)", () => {
      assertRule("gh api /repos/owner/repo --paginate", 21, "allow");
    });

    it("gh api with -q flag is allowed (no body flag)", () => {
      assertRule("gh api /repos/owner/repo -q .name", 21, "allow");
    });

    it("gh api with --header flag is allowed (no body flag)", () => {
      assertRule(
        "gh api /repos/owner/repo --header Accept:application/json",
        21,
        "allow",
      );
    });
  });

  describe("gh api write operations (fall through to rule 22: ask)", () => {
    it("gh api with -f flag defaults to POST → ask", () => {
      assertRule("gh api /repos/owner/repo -f key=value", 22, "ask");
    });

    it("gh api with -F flag defaults to POST → ask", () => {
      assertRule("gh api /repos/owner/repo -F key=value", 22, "ask");
    });

    it("gh api with --raw-field flag defaults to POST → ask", () => {
      assertRule("gh api /repos/owner/repo --raw-field key=value", 22, "ask");
    });

    it("gh api with --field flag defaults to POST → ask", () => {
      assertRule("gh api /repos/owner/repo --field key=value", 22, "ask");
    });

    it("gh api with --method POST → ask", () => {
      assertRule("gh api /repos/owner/repo --method POST", 22, "ask");
    });

    it("gh api with -X POST → ask", () => {
      assertRule("gh api /repos/owner/repo -X POST", 22, "ask");
    });

    it("gh api with --method PUT → ask", () => {
      assertRule("gh api /repos/owner/repo --method PUT", 22, "ask");
    });

    it("gh api with --method PATCH → ask", () => {
      assertRule("gh api /repos/owner/repo --method PATCH", 22, "ask");
    });

    it("gh api with -X DELETE → ask", () => {
      assertRule("gh api /repos/owner/repo -X DELETE", 22, "ask");
    });

    it("gh api with -XPOST (concatenated) → ask", () => {
      assertRule("gh api /repos/owner/repo -XPOST", 22, "ask");
    });

    it("gh api with -XPUT (concatenated) → ask", () => {
      assertRule("gh api /repos/owner/repo -XPUT", 22, "ask");
    });

    it("gh api with -XDELETE (concatenated) → ask", () => {
      assertRule("gh api /repos/owner/repo -XDELETE", 22, "ask");
    });

    it("gh api with -XPATCH (concatenated) → ask", () => {
      assertRule("gh api /repos/owner/repo -XPATCH", 22, "ask");
    });

    it("gh api with --method=POST (equals sign) → ask", () => {
      assertRule("gh api /repos/owner/repo --method=POST", 22, "ask");
    });

    it("gh api with multiple -f flags → ask", () => {
      assertRule(
        "gh api /repos/owner/repo -f title=foo -f body=bar",
        22,
        "ask",
      );
    });
  });

  // --- gh catch-all (rule 22: ask) ---
  describe("gh catch-all (rule 22: ask)", () => {
    it("gh pr create triggers ask", () => {
      assertRule("gh pr create --title foo --body bar", 22, "ask");
    });

    it("gh repo clone triggers ask", () => {
      assertRule("gh repo clone owner/repo", 22, "ask");
    });

    it("gh repo delete triggers ask", () => {
      assertRule("gh repo delete owner/repo", 22, "ask");
    });

    it("gh issue create triggers ask", () => {
      assertRule("gh issue create --title 'bug'", 22, "ask");
    });

    it("gh issue close triggers ask", () => {
      assertRule("gh issue close 42", 22, "ask");
    });

    it("gh release create triggers ask", () => {
      assertRule("gh release create v2.0", 22, "ask");
    });

    it("gh workflow run triggers ask", () => {
      assertRule("gh workflow run 123", 22, "ask");
    });

    it("gh run rerun triggers ask", () => {
      assertRule("gh run rerun 456", 22, "ask");
    });
  });

  // --- Word boundary: rule 22 must not match "gh" inside English words ---
  describe("rule 22 word boundary (no false positives from English words)", () => {
    it("'through' does not trigger rule 22", () => {
      assertNoRule('echo "going through the logs"');
    });

    it('"thorough" does not trigger rule 22', () => {
      assertNoRule("echo thorough review needed");
    });

    it('"though" does not trigger rule 22', () => {
      assertNoRule('echo "move the file though"');
    });

    it('"laughter" does not trigger rule 22', () => {
      assertNoRule("grep laughter logfile");
    });
  });

  // --- Unmatched commands (no rule matches) ---
  describe("unmatched commands", () => {
    it("ls has no matching rule", () => {
      assertNoRule("ls -la");
    });

    it("npm test has no matching rule", () => {
      assertNoRule("npm test");
    });

    it("git log has no matching rule", () => {
      assertNoRule("git log --oneline");
    });

    it("git diff has no matching rule", () => {
      assertNoRule("git diff HEAD~1");
    });

    it("cat file.txt has no matching rule", () => {
      assertNoRule("cat file.txt");
    });

    it("echo hello has no matching rule", () => {
      assertNoRule("echo hello world");
    });
  });

  // --- First-match-wins semantics ---
  describe("first-match-wins semantics", () => {
    it("git push in a compound command still matches rule 2, not rule 1", () => {
      // "git push" is the command, not "git commit"
      assertRule("git push origin main", 2, "ask");
    });

    it("gh repo view is allowed (rule 4) before gh catch-all (rule 22)", () => {
      assertRule("gh repo view owner/repo", 4, "allow");
    });

    it("gh issue view is allowed (rule 6) before gh catch-all (rule 22)", () => {
      assertRule("gh issue view 42", 6, "allow");
    });

    it("gh api implicit GET is allowed (rule 21) before gh catch-all (rule 22)", () => {
      assertRule("gh api /repos/owner/repo", 21, "allow");
    });

    it("gh api explicit GET is allowed (rule 20) before implicit GET (rule 21)", () => {
      assertRule("gh api /repos/owner/repo --method GET", 20, "allow");
    });
  });
});
