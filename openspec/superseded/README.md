# Superseded planning

These plans were abandoned before implementation when the project selected a skill-first toolkit. They are intentionally outside `openspec/changes/` so active OpenSpec discovery does not present them as work to apply.

| Former active change | Replacement direction | GitHub disposition |
| --- | --- | --- |
| `issue-to-pr-flow` | `../changes/migrate-factory-skills` imports explicit single-issue `orc-issue-to-pr`; `../changes/retire-acpx-flows` removes legacy runtime surfaces. Queue-driven factory automation remains out of scope. | No corresponding issue-to-PR issue was found during planning. |
| `pr-review-flows` | `../changes/migrate-factory-skills` imports source-faithful `orc-pr-review-repair`, not the proposed advisory/repair acpx graphs. | [#34](https://github.com/patextreme/agent-mod/issues/34) is closed as superseded/not planned, not implemented. |

Original proposal/design/spec/task/metadata files are preserved byte-for-byte. Their unchecked tasks are not completed, their proposed capabilities are not delivered, and their delta specs have not been synchronized. This directory is a repository-owned historical planning shelf, not an OpenSpec completed-change archive or a new CLI lifecycle feature.

The replacement plans adopt Lace wallet-sync skills at commit `480e7d565e63469055caf7da75c98efb00d3b415`, with the author's confirmed MIT permission. They deliberately do not preserve every old flow guarantee. Missing finalization and full lifecycle composition are tracked in [#47](https://github.com/patextreme/agent-mod/issues/47) and [#48](https://github.com/patextreme/agent-mod/issues/48).

Do not apply or archive these old plans as completed work. Any future reuse of their ideas needs a new approved change against current capabilities.
