# PR review defers findings outside the PR's intent

`pr-review-repair` grounds actionable findings in a pinned intent contract: the originating issue/spec's required outcomes plus the PR's declared scope and non-goals. A material finding with no PR-intent grounding is `deferred`: visible in the PR report and full ledger, terminal across resumes, and never authorized for repair, a repair-start ID, or a scope amendment. Deferred findings do not block `verified`; a regression the PR caused or worsened is in-intent.

This follows the `pr` playbook in `patextreme/ptah-libs`, which captures the PR's intention in the ledger and has the judge steer important-but-out-of-scope findings to deferred status without gating convergence. The guardrail separates review coverage from repair scope: reviewers still inspect the full diff and affected callers/contracts, so a real issue is reported rather than suppressed; only the repair queue is narrowed. An in-intent correction whose only viable fix is overarching is deferred when its consequence permits, and escalates a scope decision when it blocks the PR's stated intent.

The alternative — severity-only repair authorization — let a material pre-existing or repo-wide issue consume the PR's repair budget and blur what the PR was for. Escalating every out-of-scope finding instead would interrupt the user for work the PR never promised. The cost is that deferred findings can be ignored; visibility in the report and ledger is the mitigation.

Revisit if deferred findings routinely hide real regressions, or if the intent contract cannot be pinned reliably.
