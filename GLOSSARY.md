# Glossary

Language for the repository's test suites and its usage-reporting extensions.

## Language

### Testing

**Quality gate**:
A check every change must pass before delivery: formatting, linting, typechecking, and the test suites. Quality gates run locally and are mirrored by the hermetic gate.
_Avoid_: CI check, build step

**Gate test**:
A model-free, deterministic test that runs as a quality gate on every change. A gate test lives beside its extension module or, when no module owns it, under the shared gates directory.
_Avoid_: Harness test, smoke test, CI test

**Hermetic gate**:
The sandboxed build that rebuilds every package and reruns every quality gate with pinned inputs.
_Avoid_: CI pipeline, build job

### Usage reporting

**Usage meter**:
A provider-reported allowance window with a consumed percentage; reset times are metadata the status slot does not display.
_Avoid_: Balance, quota

**Rolling meter**:
The five-hour OpenCode Go allowance window that the usage API calls `rolling`.
_Avoid_: Session, five-hour session

**Status slot**:
A named footer cell owned by one extension through `ctx.ui.setStatus`, cleared or replaced only by that extension.
_Avoid_: Status bar, badge

**Peak window**:
A recurring time range, expressed in UTC weekdays and hours, during which a model's published pricing multiplier applies; the catalog's base price is the off-peak price.
_Avoid_: Surge window, busy hour

**Off-peak**:
Every instant outside the model's recurring peak windows, including all weekend; the effective multiplier is at most one.
_Avoid_: Normal price, baseline

**Pricing multiplier**:
A catalog rule with a `when` predicate and a `factor`; the effective multiplier is the product of the rules matching an instant, and a factor greater than one means peak pricing.
_Avoid_: Price tier, surcharge
