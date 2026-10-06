import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import { dirname, resolve } from "node:path";
import { Readable, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";

const config = JSON.parse(
  await readFile(resolve(process.cwd(), ".all-fixture.json"), "utf8"),
);
const sessions = new Map();
const jsonLine = (prompt, label) =>
  JSON.parse(prompt.split(label)[1].split("\n")[0]);
async function count(path, pattern) {
  return [...(await readFile(path, "utf8")).matchAll(pattern)].length;
}
async function append(path, text) {
  const before = await readFile(path, "utf8");
  assert.ok(before.includes("KEEP DIRTY"));
  await writeFile(path, before + text);
}
async function response(prompt) {
  const groomCount = await count(config.planning, /<!-- groom-\d+ -->/g);
  const verifyCount = await count(config.implementation, /\/\/ verify-\d+/g);
  const groomBlocked = groomCount < (config.groomRepairs ?? 0);
  const verifyBlocked = verifyCount < (config.verifyRepairs ?? 0);
  const escalation = (stage) => config.escalation === stage;
  if (prompt.startsWith("/skill:openspec-review "))
    return groomBlocked
      ? `Critical: current finding ${groomCount}`
      : "Conclusive review: no Critical findings; Major does not block grooming.";
  if (prompt.startsWith("Read this current review"))
    return {
      route: prompt.includes("Critical: current finding")
        ? "critical"
        : "clear",
    };
  if (prompt.startsWith("Read-only resolution assessment"))
    return {
      conclusive: true,
      missingArtifacts: [],
      resolutions: [
        {
          id: `groom-${groomCount}`,
          issue: "Clarify current design",
          recommendation: "Keep prior work; choose scoped behavior",
          escalation: escalation("groom"),
          paths: [config.planning],
        },
      ],
    };
  if (prompt.startsWith("OpenSpec grooming updater")) {
    const authorization = JSON.parse(prompt.split("\n")[3]);
    assert.deepEqual(
      authorization.existingArtifactAllowlist.sort(),
      config.artifacts.slice().sort(),
    );
    if (escalation("groom"))
      assert.ok(authorization.steering[`groom-${groomCount}`]?.trim());
    await append(config.planning, `<!-- groom-${groomCount} -->\n`);
    return "Current authorized artifacts updated; dirty content preserved";
  }
  if (prompt.startsWith("/skill:openspec-apply-change ")) {
    const attempt = Number(
      prompt.match(/; attempt (\d+) \(0 is initial apply\)/)[1],
    );
    const steering = jsonLine(prompt, "ACCUMULATED SCOPED STEERING: ");
    if (attempt && escalation("implement"))
      assert.ok(
        steering.some(
          (s) => s.blocker.id === `implement-${attempt - 1}` && s.answer.trim(),
        ),
      );
    assert.ok(prompt.includes("No commit, stash, reset, rollback, archive"));
    await append(config.implementation, `// implement-${attempt}\n`);
    const blocked = attempt < (config.implementRepairs ?? 0);
    return {
      summary: `Implement attempt ${attempt}`,
      completedTasks: blocked ? [] : ["1.1"],
      remainingTasks: blocked ? ["1.1"] : [],
      blockers: blocked
        ? [
            {
              id: `implement-${attempt}`,
              issue: "Clarify approved scope",
              recommendation: "Permit this issue only",
              escalation: escalation("implement"),
              scope: "implementation.ts only; no external access",
            },
          ]
        : [],
      gates: [
        {
          command: "fixture gate",
          exitCode: blocked ? 1 : 0,
          afterEdits: true,
          attempt,
        },
      ],
      noApplicableGates: null,
      delegatedGroups: [],
    };
  }
  if (prompt.startsWith("Task-and-gate decision judge")) {
    const packet = JSON.parse(prompt.split("\n")[1]);
    return {
      route: packet.report.blockers.length
        ? escalation("implement")
          ? "escalation_required"
          : "repairable_pause"
        : "completed",
    };
  }
  if (prompt.startsWith("/skill:openspec-verify-change ")) {
    const snapshot = jsonLine(prompt, "CURRENT SNAPSHOT: ");
    assert.equal(snapshot.state, "all_done");
    return {
      report: "Independent full verification report",
      conclusive: config.fail !== "verify:inconclusive",
      dimensions: Object.fromEntries(
        ["completeness", "correctness", "coherence"].map((k) => [
          k,
          {
            status: "checked",
            reason: `Current ${k} checked`,
            evidence: ["implementation.ts:1"],
          },
        ]),
      ),
      findings: verifyBlocked
        ? [
            {
              id: `finding-${verifyCount}`,
              severity: "WARNING",
              issue: "Current behavior needs correction",
              recommendation: "Apply current scoped fix",
              evidence: ["implementation.ts:1"],
            },
          ]
        : [],
      gates: [
        {
          command: "fixture gate",
          exitCode: 0,
          result: "Fresh current evidence",
        },
      ],
      noApplicableGates: null,
      missingEvidence: [],
    };
  }
  if (prompt.startsWith("Read-only verification classifier")) {
    const packet = JSON.parse(prompt.split("\n")[1]);
    return {
      route: packet.report.conclusive
        ? packet.report.findings.length
          ? "blocking"
          : "accepted"
        : "inconclusive",
    };
  }
  if (prompt.startsWith("Read-only verification resolution assessment"))
    return {
      resolutions: [
        {
          id: `verify-${verifyCount}`,
          findingIds: [`finding-${verifyCount}`],
          issue: "Resolve current Warning",
          recommendation: "Correct current implementation only",
          scope: "implementation.ts current behavior",
          paths: [config.implementation],
          escalation: escalation("verify"),
          reason:
            "Approved mechanical correction or explicitly scoped decision",
        },
      ],
    };
  if (prompt.startsWith("OpenSpec verification repair")) {
    const attempt = Number(prompt.match(/; repair attempt (\d+)/)[1]);
    assert.equal(attempt, verifyCount + 1, "verify starts with its own budget");
    const packet = JSON.parse(prompt.split("\n")[1]);
    if (escalation("verify"))
      assert.ok(
        packet.steering.some(
          (s) => s.resolution.id === `verify-${verifyCount}` && s.answer.trim(),
        ),
      );
    await append(config.implementation, `// verify-${attempt}\n`);
    return {
      summary: "Scoped repair; fresh verifier must check it",
      changes: ["implementation.ts"],
      unresolved: [],
      gates: [
        {
          command: "fixture gate",
          exitCode: 0,
          result: "Current repaired gate",
        },
      ],
    };
  }
  if (prompt.startsWith("OpenSpec finalization sync worker")) {
    const inputs = jsonLine(prompt, "SYNC INPUTS: ");
    assert.ok(prompt.includes("No human prompts"));
    for (const cap of inputs.capabilities) {
      await mkdir(dirname(cap.mainPath), { recursive: true });
      await writeFile(cap.mainPath, config.expected[cap.capability]);
      if (config.fail === "finalize:partial-sync")
        throw new acp.RequestError(
          -32000,
          "Partial sync failure; preserve edit",
        );
    }
    return {
      outcome: "success",
      summary: "WORKER TRANSCRIPT NOT ASSESSOR EVIDENCE",
      issues: [],
      placeholders: [],
    };
  }
  if (prompt.startsWith("Read-only independent synchronization assessor")) {
    assert.ok(!prompt.includes("WORKER TRANSCRIPT NOT ASSESSOR EVIDENCE"));
    const inputs = jsonLine(prompt, "ASSESS INPUTS: ");
    const verdict =
      config.fail === "finalize:mismatch" ? "mismatch" : "accepted";
    return {
      verdict,
      summary: "Independent sync inspection",
      issues: verdict === "accepted" ? [] : ["Sync mismatches"],
      coverage: inputs.capabilities.map((cap) => ({
        capability: cap.capability,
        verdict,
        operations: cap.operations.map((op) => ({
          id: op.id,
          verdict,
          evidence: [`${op.id} inspected in current main spec`],
        })),
        purposeEvidence: ["Original or delta Purpose preserved"],
        structureEvidence: ["Main-spec format checked"],
        preservationEvidence: ["KEEP DIRTY HUMAN SCENARIO intact"],
        rulesEvidence: inputs.rules.length ? ["Rules applied to content"] : [],
        retirementEvidence: ["Explicit retirement considered"],
        discrepancies: verdict === "accepted" ? [] : ["Mismatch found"],
      })),
    };
  }
  throw new Error(`Unexpected pipeline dispatch: ${prompt}`);
}
async function respond(params, client) {
  assert.equal(
    sessions.get(params.sessionId),
    0,
    "Every dispatch must have a fresh session",
  );
  sessions.set(params.sessionId, 1);
  const prompt = params.prompt
    .map((p) => {
      assert.equal(p.type, "text");
      return p.text;
    })
    .join("\n");
  if (
    config.fail === "groom:agent" &&
    prompt.startsWith("/skill:openspec-review")
  )
    throw new acp.RequestError(-32000, "Unexpected review failure");
  if (
    config.fail === "implement:agent" &&
    prompt.startsWith("/skill:openspec-apply-change")
  ) {
    await append(config.implementation, "// partial implement edit\n");
    throw new acp.RequestError(-32000, "Partial implement failure");
  }
  const output = await response(prompt);
  const nodeId = prompt.startsWith("/skill:openspec-review")
    ? "groom:review"
    : prompt.startsWith("/skill:openspec-apply-change")
      ? "implement:apply"
      : prompt.startsWith("/skill:openspec-verify-change")
        ? "verify:verify"
        : prompt.startsWith("OpenSpec finalization sync worker")
          ? "finalize:sync"
          : prompt.startsWith("Read-only independent synchronization assessor")
            ? "finalize:assess"
            : null;
  if (config.interrupt === nodeId) {
    await new Promise((ready, reject) => {
      const socket = createConnection(
        { host: "127.0.0.1", port: config.readyPort },
        () => socket.end(`${nodeId}\n`),
      );
      socket.on("error", reject);
      socket.on("close", ready);
    });
    await new Promise(() => {});
  }
  await client.notify(acp.methods.client.session.update, {
    sessionId: params.sessionId,
    update: {
      sessionUpdate: "agent_message_chunk",
      content: {
        type: "text",
        text: typeof output === "string" ? output : JSON.stringify(output),
      },
    },
  });
  return { stopReason: "end_turn" };
}
acp
  .agent({ name: "all-fixture" })
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
