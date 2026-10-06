# Issue-to-PR

Language for turning a GitHub issue into an implementation proposed through a pull request.

## Language

**Base branch**:
The branch selected as the starting point for the issue's implementation.
_Avoid_: Working branch

**Issue workspace**:
The isolated checkout in which one issue's planning and implementation take place.
_Avoid_: Caller checkout

**Issue request**:
The captured issue title, body and explicitly selected clarification comments that define the requested work for a run.
_Avoid_: Live issue state

**Issue attempt**:
One effort to implement an issue request from a selected baseline, including any clarification or repair continuations that preserve that request and baseline's validity.
_Avoid_: Flow run (a single execution, not necessarily the whole attempt)

**Escalation**:
A request for explicit human direction when an issue attempt cannot safely proceed autonomously.
_Avoid_: Failure (an escalation may allow the attempt to continue)
