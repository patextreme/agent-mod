# Issue labels

Labels live in GitHub Issues for `patextreme/agent-mod`.

## Triage states

| Canonical role | GitHub label | Meaning |
| --- | --- | --- |
| needs-triage | `needs-triage` | Maintainer needs to evaluate this issue |
| needs-info | `needs-info` | Waiting on the reporter for more information |
| ready-for-agent | `ready-for-agent` | Fully specified and ready for autonomous implementation |
| ready-for-human | `ready-for-human` | Requires human implementation |
| wontfix | `wontfix` | Will not be actioned |

When a skill names a canonical triage role, use its mapped GitHub label.

## Other labels

| Label | Meaning |
| --- | --- |
| `bug` | Something is not working |
| `documentation` | Documentation improvements or additions |
| `duplicate` | Issue or pull request already exists |
| `enhancement` | New feature or request |
| `good first issue` | Suitable for newcomers |
| `help wanted` | Extra attention is needed |
| `invalid` | Report does not appear valid |
| `question` | Further information is requested |
| `openspec` | Routes work through OpenSpec orchestration skills |

`question` is an existing classification label; `needs-info` specifically
indicates that triage is waiting on reporter information.

The `openspec` routing label is independent of implementation readiness.
