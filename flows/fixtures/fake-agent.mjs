#!/usr/bin/env node
// Deterministic ACP fixture: no models, tools, reports, state files, or Git.
// Configuration is prepared by the test BEFORE any session starts.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, realpath, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Readable, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";

const sessions = new Map();
const config = JSON.parse(
  await readFile(resolve(process.cwd(), ".groom-fixture.json"), "utf8"),
);

function resolutions(cycle, artifact) {
  const repair = {
    id: `cycle-${cycle}`,
    issue: `FINDING-${cycle}: repair the existing design`,
    recommendation: `Preserve intent and append repair ${cycle}`,
    escalation: config.escalation ?? false,
    paths: [artifact],
  };
  return config.mixedResolutions
    ? [
        { ...repair, id: `${repair.id}-autonomous`, escalation: false },
        { ...repair, id: `${repair.id}-product`, escalation: true },
        { ...repair, id: `${repair.id}-design`, escalation: true },
      ]
    : [repair];
}

function assessmentFails(updates) {
  return (
    config.assessmentFailure && updates >= (config.assessmentFailureAfter ?? 0)
  );
}

async function respond(params, client) {
  const session = sessions.get(params.sessionId);
  assert.ok(session, "unknown ACP session");
  assert.equal(session.prompts++, 0, "every ACP turn must be isolated");
  const prompt = params.prompt
    .map((part) => {
      assert.equal(part.type, "text");
      return part.text;
    })
    .join("\n");
  const artifact = config.artifact;
  assert.equal(await realpath(artifact), artifact);
  const before = await readFile(artifact, "utf8");
  const updates = [...before.matchAll(/^<!-- fixture-repair-\d+ -->$/gm)]
    .length;
  const cycle = updates + 1;
  let response;
  if (prompt.startsWith("/skill:openspec-review ")) {
    assert.equal(prompt, `/skill:openspec-review ${config.changeId}`);
    if (config.mode === "agent-failure")
      throw new acp.RequestError(-32000, "fixture agent failure");
    response =
      config.mode === "inconclusive"
        ? "Incomplete review: unable to determine findings."
        : updates < (config.repairsNeeded ?? 1)
          ? `Complete review. Critical: FINDING-${cycle}: repair the existing design. Verdict: blocked.`
          : "Complete review. No Critical findings. Major: follow-up clarification remains. Verdict: blocked, not implementation-ready.";
    response += `\nACP_SESSION_ID=${params.sessionId}`;
  } else if (
    prompt.includes("Read this current review, not just its verdict.")
  ) {
    assert.ok(
      prompt.includes('"route"'),
      "decision must request route, not choice",
    );
    response = JSON.stringify({
      route: prompt.includes("Incomplete review:")
        ? "inconclusive"
        : prompt.includes("Critical: FINDING-")
          ? "critical"
          : "clear",
      sessionId: params.sessionId,
    });
  } else if (prompt.startsWith("Read-only resolution assessment")) {
    const current = JSON.parse(prompt.slice(prompt.indexOf("\n") + 1));
    assert.ok(current.existingArtifactAllowlist.includes(artifact));
    for (let prior = 1; prior < cycle; prior++) {
      assert.ok(
        !prompt.includes(`FINDING-${prior}:`),
        "stale finding in assessment",
      );
      assert.ok(
        !prompt.includes(`STEERING-${prior}:`),
        "stale steering in assessment",
      );
    }
    response = JSON.stringify({
      conclusive: !(
        assessmentFails(updates) && config.assessmentFailure === "inconclusive"
      ),
      missingArtifacts:
        assessmentFails(updates) &&
        config.assessmentFailure === "missing-artifacts"
          ? ["specs/missing-capability/spec.md"]
          : [],
      resolutions: resolutions(cycle, artifact),
      sessionId: params.sessionId,
    });
  } else if (prompt.startsWith("OpenSpec grooming updater for ")) {
    assert.ok(!prompt.includes("/skill:openspec-update-change"));
    assert.ok(prompt.includes("without additional per-artifact confirmations"));
    assert.ok(prompt.includes("fresh assessment and steering"));
    const authorization = JSON.parse(prompt.split("\n")[3]);
    assert.equal(authorization.changeId, config.changeId);
    assert.ok(!assessmentFails(updates), "failed assessment authorized update");
    assert.deepEqual(authorization.resolutions, resolutions(cycle, artifact));
    assert.ok(authorization.existingArtifactAllowlist.includes(artifact));
    for (const issue of authorization.resolutions)
      if (issue.escalation) assert.ok(authorization.steering[issue.id]?.trim());
    for (let prior = 1; prior < cycle; prior++) {
      assert.ok(
        !prompt.includes(`FINDING-${prior}:`),
        "stale finding in update",
      );
      assert.ok(
        !prompt.includes(`STEERING-${prior}:`),
        "stale steering in update",
      );
    }
    assert.ok(
      before.includes(config.dirtySentinel),
      "initial dirty content lost",
    );
    // The only write performed by this process, always to an existing allowlisted file.
    await writeFile(artifact, `${before}<!-- fixture-repair-${cycle} -->\n`);
    response = `Applied repair ${cycle}. ACP_SESSION_ID=${params.sessionId}`;
  } else {
    throw new Error(`Unexpected fixture prompt: ${prompt}`);
  }
  await client.notify(acp.methods.client.session.update, {
    sessionId: params.sessionId,
    update: {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: response },
    },
  });
  return { stopReason: "end_turn" };
}

// Same stdio transport and server API as SDK dist/examples/agent.js.
acp
  .agent({ name: "groom-fixture" })
  .onRequest("initialize", () => ({
    protocolVersion: acp.PROTOCOL_VERSION,
    agentCapabilities: { loadSession: false },
  }))
  .onRequest("authenticate", () => ({}))
  .onRequest("session/new", (ctx) => {
    assert.equal(ctx.params.cwd, process.cwd());
    const sessionId = randomUUID();
    sessions.set(sessionId, { prompts: 0 });
    return { sessionId };
  })
  .onRequest("session/set_mode", () => ({}))
  .onRequest("session/prompt", (ctx) => respond(ctx.params, ctx.client))
  .onNotification("session/cancel", () => {})
  .connect(
    acp.ndJsonStream(
      Writable.toWeb(process.stdout),
      Readable.toWeb(process.stdin),
    ),
  );
