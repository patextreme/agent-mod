# Verification control flow

Adapt this pseudocode into codemode calls or a `SubagentWorkflow` script, following the Execution guidance in `SKILL.md`. `SKILL.md` defines the stage contracts and reporting requirements.

## Pseudocode

```text
DELEGATE(contract, brief):
  RUN a separate agent under the named stage contract
  RETURN its completed result; UPDATE round counts

REPEAT:
  report = DELEGATE(Verify, selected change and previous evidence)
  IF selection is ambiguous:
    ASK for selection; SAVE and PAUSE; restart verification after reply
  IF agent failed:
    REPORT impediment and ASK for input
  IF report is incomplete or severity indeterminate:
    DELEGATE missing investigation if safe, then restart verification
    OTHERWISE REPORT blocked scope and ASK for input
  KEEP resolved change/store fixed unless the user changes it
  RETAIN artifact paths and evidence

  IF Decide establishes complete verification with Critical = 0 AND Warning = 0:
    FINISH as verified success
  IF findings recur without substantive progress:
    REPORT impediment and ASK for input

  repair = DELEGATE(Repair, exact selection, full report, and permitted scope)
  VALIDATE result; RETAIN actual edits, dispositions, and check outcomes
  IF agent failed or result is incomplete:
    REPORT partial work and ASK for input
  IF repair is blocked:
    FOLLOW Escalate; SAVE and PAUSE
    AFTER user input, delegate authorized repair before re-verification
  CONTINUE with fresh verification of the actual implementation
```

Each `ASK` pauses the loop. Use the Finish contract for success, blocked, and partial reports.
