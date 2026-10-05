import assert from "node:assert/strict";
import { test } from "node:test";
import type { FlowNodeContext } from "acpx/flows";
import { createGroomFlow } from "./flow.js";
import { parseAssessment, type Target, updatePrompt } from "./helpers.js";

const target: Target = {
  changeId: "example",
  cwd: "/workspace",
  changeRoot: "/workspace/openspec/changes/example",
  artifacts: ["/workspace/openspec/changes/example/design.md"],
};
const context = {
  outputs: {
    preflight: target,
    validate: { route: "valid", issues: [] },
    review:
      "Major: owner must choose retention. No Critical findings. Complete.",
  },
} as unknown as FlowNodeContext;

// Prompt-contract regression checks, not claims about live-model compliance.
test("review keeps ID-only input and classifier separates reviewed decisions from unusable output", async () => {
  const flow = createGroomFlow();
  const review = flow.nodes.review;
  const classify = flow.nodes.classify;
  assert.equal(review.nodeType, "acp");
  assert.equal(classify.nodeType, "acp");
  if (review.nodeType !== "acp" || classify.nodeType !== "acp") return;
  assert.equal(await review.prompt(context), "/skill:openspec-review example");
  const prompt = JSON.stringify(await classify.prompt(context));
  assert.match(prompt, /reviewed uncertainty with determinate severity/);
  assert.match(prompt, /incomplete or unusable output/);
  assert.match(prompt, /Do not promote Major findings/);
  assert.match(
    prompt,
    /no Critical findings, even if Major findings or blockers remain/,
  );
  assert.deepEqual(review.session, { isolated: true });
  assert.deepEqual(classify.session, { isolated: true });
});

test("assessment and authorization keep decisions separate from severity and repair scope", async () => {
  const node = createGroomFlow().nodes.assess;
  assert.equal(node.nodeType, "acp");
  if (node.nodeType !== "acp") return;
  const prompt = JSON.stringify(await node.prompt(context));
  assert.match(
    prompt,
    /Assess ONLY current structural errors or Critical findings/,
  );
  assert.match(
    prompt,
    /conclusively identify the decision requiring steering without choosing its answer/,
  );
  assert.match(prompt, /do not promote Major findings/);
  assert.deepEqual(node.session, { isolated: true });
  const assessment = parseAssessment(
    JSON.stringify({
      conclusive: true,
      missingArtifacts: [],
      resolutions: [
        {
          id: "critical-choice",
          issue: "Prefix deletion threatens retained user uploads",
          recommendation:
            "Obtain the owner's safe retention decision; do not choose it",
          escalation: true,
          paths: target.artifacts,
        },
      ],
    }),
    target,
  );
  assert.equal(assessment.route, "steering");
  assert.throws(() => updatePrompt(target, assessment, {}), /Missing steering/);
  const authorized = updatePrompt(target, assessment, {
    "critical-choice":
      "Preserve user uploads and delete only expired generated files",
  });
  assert.match(authorized, /does not independently target Major findings/);
  assert.match(authorized, /do not promote Major findings/);
  assert.match(
    authorized,
    /No new files, unrelated edits, implementation changes/,
  );
});
