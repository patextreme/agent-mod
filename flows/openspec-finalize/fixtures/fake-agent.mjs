import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import { dirname, resolve } from "node:path";
import { Readable, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";

const config = JSON.parse(
  await readFile(resolve(process.cwd(), ".finalize-fixture.json"), "utf8"),
);
const sessions = new Map();
async function respond(params, client) {
  assert.equal(sessions.get(params.sessionId), 0);
  sessions.set(params.sessionId, 1);
  const prompt = params.prompt
    .map((p) => {
      assert.equal(p.type, "text");
      return p.text;
    })
    .join("\n");
  const sync = prompt.startsWith("OpenSpec finalization sync worker");
  assert.ok(
    sync || prompt.startsWith("Read-only independent synchronization assessor"),
    "No verifier/repair/steering dispatch",
  );
  const phase = sync ? "sync" : "assessment";
  const inputs = JSON.parse(
    prompt.split(sync ? "SYNC INPUTS: " : "ASSESS INPUTS: ")[1].split("\n")[0],
  );
  assert.ok(prompt.includes("No human prompts"));
  assert.ok(!prompt.includes("/skill:"));
  assert.equal(inputs.capabilities.length, 2);
  assert.equal(inputs.metadata.includes("retire_capabilities: true"), true);
  if (!sync) {
    assert.ok(prompt.includes("READ-ONLY"));
    assert.ok(!prompt.includes("WORKER TRANSCRIPT MUST NOT REACH ASSESSOR"));
    for (const cap of inputs.capabilities)
      assert.equal(
        inputs.current[cap.capability],
        await readFile(cap.mainPath, "utf8"),
      );
  }
  if (config.mode === `${phase}-failure`)
    throw new acp.RequestError(-32000, `${phase} invocation failure`);
  if (sync && config.mode !== "ambiguity") {
    for (const cap of inputs.capabilities) {
      assert.ok(
        cap.mainPath.startsWith(`${resolve(config.cwd, "openspec/specs")}/`),
      );
      await mkdir(dirname(cap.mainPath), { recursive: true });
      await writeFile(cap.mainPath, config.expected[cap.capability]);
      if (config.mode === "partial-sync-failure")
        throw new acp.RequestError(-32000, "Partial spec edit then failure");
    }
  }
  if (config.mode === `${phase}-interrupt`) {
    await new Promise((ready, reject) => {
      const socket = createConnection(
        { host: "127.0.0.1", port: config.readyPort },
        () =>
          socket.end(
            `${JSON.stringify({ phase, sessionId: params.sessionId })}\n`,
          ),
      );
      socket.on("error", reject);
      socket.on("close", ready);
    });
    await new Promise(() => {});
  }
  let report;
  if (sync)
    report = {
      outcome: config.mode === "ambiguity" ? "failed" : "success",
      summary: "WORKER TRANSCRIPT MUST NOT REACH ASSESSOR",
      issues: config.mode === "ambiguity" ? ["Ambiguous intended merge"] : [],
      placeholders: [],
      sessionId: params.sessionId,
    };
  else {
    const verdict =
      config.mode === "mismatch"
        ? "mismatch"
        : config.mode === "inconclusive"
          ? "inconclusive"
          : "accepted";
    const correct = inputs.capabilities.every(
      (cap) =>
        inputs.current[cap.capability] === config.expected[cap.capability],
    );
    report = {
      verdict: correct ? verdict : "mismatch",
      summary: "Actual current files independently checked",
      issues:
        verdict === "accepted" && correct
          ? []
          : ["Synchronization not accepted"],
      coverage: inputs.capabilities.map((cap) => ({
        capability: cap.capability,
        verdict: correct ? verdict : "mismatch",
        operations: cap.operations.map((op) => ({
          id: op.id,
          verdict: correct ? verdict : "mismatch",
          evidence: [
            `${op.id}: ${op.to ?? op.name} observed with intended effect in current spec`,
          ],
        })),
        purposeEvidence: [
          cap.baseline === null
            ? "Delta Purpose copied verbatim"
            : "Original Purpose preserved",
        ],
        structureEvidence: ["One Requirements section and no delta headers"],
        preservationEvidence: [
          cap.baseline === null
            ? "No prior baseline to lose"
            : "KEEP DIRTY HUMAN SCENARIO remains unchanged",
        ],
        rulesEvidence: ["SHALL and WHEN/THEN scenarios inspected"],
        retirementEvidence: [
          "Explicit retirement metadata considered; neither capability emptied",
        ],
        discrepancies:
          correct && verdict === "accepted"
            ? []
            : ["Current synchronization evidence not accepted"],
      })),
      sessionId: params.sessionId,
    };
    if (config.mode === "missing-coverage") report.coverage.pop();
    if (config.mode === "overclaimed") {
      report.coverage[0].operations[0].verdict = "mismatch";
    }
  }
  const response =
    config.mode === `malformed-${phase}` ? "not JSON" : JSON.stringify(report);
  await client.notify(acp.methods.client.session.update, {
    sessionId: params.sessionId,
    update: {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: response },
    },
  });
  return { stopReason: "end_turn" };
}
acp
  .agent({ name: "finalize-fixture" })
  .onRequest("initialize", () => ({
    protocolVersion: acp.PROTOCOL_VERSION,
    agentCapabilities: { loadSession: false },
  }))
  .onRequest("authenticate", () => ({}))
  .onRequest("session/new", (ctx) => {
    assert.equal(ctx.params.cwd, config.cwd);
    const sessionId = randomUUID();
    sessions.set(sessionId, 0);
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
