Create a acpx flow named `openspec-groom`.
The flow is located at `./flows/`.
See docs here: https://acpx.sh/flows.html

This is the flow logic

1. Take openspec `changeId` as input
2. Run skill openspec-review on the change to check if the change is ready to implement
3. Base on the review finding, if the review contains Critical finding, go to step 4. If not, the flow ends

4. For the critical issues flagged. Evaluate if it is resolvable autonomously without human decision. If no human needed, go to step 6.
5. Human to provide the steering to resolve the critical issues.
6. Proceed with updateing openspec change to resolve the critical issues.

Repeat until max iteration of 10 or no more critical issues found


