# Grooming control flow

Adapt this pseudocode into codemode calls or a `SubagentWorkflow` script, following the Execution guidance in `SKILL.md`. `SKILL.md` defines the stage contracts and reporting requirements.

## Pseudocode

```text
DELEGATE(contract, brief):
  RUN a separate agent under the named stage contract
  RETURN its completed result; UPDATE round counts

REPEAT:
  report = DELEGATE(Review, selected change and repository)
  IF selection is ambiguous:
    ASK for selection; SAVE and PAUSE; restart review after reply
  IF agent failed:
    REPORT impediment and ASK for input
  IF report is incomplete or severity indeterminate:
    DELEGATE missing investigation if safe, then restart review
    OTHERWISE REPORT limited scope and ASK for input
  KEEP resolved change fixed unless the user changes it
  RETAIN full report and evidence

  IF complete review reports Critical = 0:
    FINISH under the reporting contract, surfacing remaining findings and decisions
  IF findings recur without substantive progress:
    REPORT impediment and ASK for input

  classification = DELEGATE(Decide, full report and established intent)
  VALIDATE classification of every Critical repair
  IF classification failed, is incomplete, or requires human input:
    REPORT exact impediment or decision/options and ASK for input
    AFTER reply, resolve classification before proceeding

  repair = DELEGATE(Repair, exact change, full report, and authorized decisions)
  RETAIN edited files and per-finding dispositions
  IF repair failed, made no progress, or is incomplete:
    REPORT partial work and ASK for input
  IF repair needs a consequential decision:
    SAVE and PAUSE; ASK for the decision
    AFTER reply, delegate authorized repair before re-review
  CONTINUE with a fresh read-only review
```

Each `ASK` pauses the loop. Use the reporting contract for successful, blocked, and partial runs; zero Critical findings is not structural validation or implementation readiness.
