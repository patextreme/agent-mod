#!/usr/bin/env node
// Deterministic ACP fixture: no models, tools, reports, state files, or Git.
// Configuration is prepared by the test BEFORE any session starts.
// Verify, implement and groom configurations are separate; older behavior is unchanged.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, realpath, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import { resolve } from "node:path";
import { Readable, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";

const sessions = new Map();
let implement = false;
let verify = false;
let configText;
try {
  configText = await readFile(
    resolve(process.cwd(), ".verify-fixture.json"),
    "utf8",
  );
  verify = true;
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  try {
    configText = await readFile(
      resolve(process.cwd(), ".implement-fixture.json"),
      "utf8",
    );
    implement = true;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    configText = await readFile(
      resolve(process.cwd(), ".groom-fixture.json"),
      "utf8",
    );
  }
}
const config = JSON.parse(configText);

function implementBlockers(attempt) {
  if (attempt >= (config.repairsNeeded ?? 0)) return [];
  const escalation = config.escalation || config.escalationAt === attempt;
  const blocker = {
    id: `attempt-${attempt}-design`,
    issue: `BLOCKER-${attempt}: clarify approved design`,
    recommendation:
      "Retain user edits and authorize only the described plan adjustment",
    escalation: Boolean(escalation),
    scope: `design.md section ${attempt}; no external access or destructive actions`,
  };
  return config.mixedBlockers && escalation
    ? [
        { ...blocker, id: `attempt-${attempt}-autonomous`, escalation: false },
        blocker,
        {
          ...blocker,
          id: `attempt-${attempt}-product`,
          scope: `proposal.md section ${attempt}`,
        },
      ]
    : [blocker];
}

async function implementResponse(prompt, sessionId) {
  const artifact = config.artifact;
  assert.equal(await realpath(artifact), artifact);
  const before = await readFile(artifact, "utf8");
  assert.ok(
    before.includes(config.dirtySentinel),
    "initial dirty content lost",
  );
  if (prompt.startsWith("/skill:openspec-apply-change ")) {
    assert.ok(
      prompt.startsWith(`/skill:openspec-apply-change ${config.changeId}\n`),
    );
    const attempt = Number(
      prompt.match(/; attempt (\d+) \(0 is initial apply\)/)?.[1],
    );
    assert.ok(Number.isInteger(attempt), "missing explicit attempt");
    const updates = [...before.matchAll(/^\/\/ fixture-implement-\d+$/gm)]
      .length;
    assert.equal(
      attempt + (config.initialUpdates ?? 0),
      updates,
      "repair prompt must advance exactly once per dispatch",
    );
    const current = JSON.parse(
      prompt.split("CURRENT SNAPSHOT: ")[1].split("\n")[0],
    );
    assert.equal(current.instructions.changeName, config.changeId);
    assert.equal(
      current.instructions.changeDir,
      resolve(process.cwd(), "openspec/changes", config.changeId),
    );
    for (const paths of Object.values(current.instructions.contextFiles))
      for (const path of paths) await readFile(path, "utf8");
    const prior = JSON.parse(prompt.split("PRIOR REPORT: ")[1].split("\n")[0]);
    const steering = JSON.parse(
      prompt.split("ACCUMULATED SCOPED STEERING: ")[1].split("\n")[0],
    );
    if (attempt === 0) {
      assert.equal(prior, null);
      assert.deepEqual(steering, []);
    } else {
      assert.equal(prior.summary, `Implementer attempt ${attempt - 1}`);
      const expected = config.forceEscalation
        ? [
            {
              id: "assessment-0",
              issue: "Clarify existing approved scope",
              recommendation: "Authorize this issue only",
              escalation: true,
              scope: "design.md section 0 only",
            },
          ]
        : Array.from({ length: attempt }, (_, i) => implementBlockers(i))
            .flat()
            .filter((blocker) => blocker.escalation);
      assert.deepEqual(
        steering.map((item) => item.blocker),
        expected,
        "authorization must stay associated with its original blocker and scope",
      );
      for (const item of steering)
        assert.equal(
          item.answer,
          `ANSWER ${item.blocker.id}: permit only ${item.blocker.scope}`,
        );
    }
    assert.ok(prompt.includes("Delegate multiple substantive task groups"));
    assert.ok(prompt.includes("Parent owns task checklist consolidation"));
    assert.ok(prompt.includes("after the last relevant edit"));
    assert.ok(prompt.includes("No commit, stash, reset, rollback, archive"));
    if (
      config.mode === "agent-failure" &&
      attempt === (config.failureAt ?? 0) &&
      config.failureBeforeWrite
    )
      throw new acp.RequestError(
        -32000,
        "fixture implementer failure before write",
      );
    // One bounded append to an existing implementation/task sentinel; no new files.
    await writeFile(artifact, `${before}// fixture-implement-${attempt}\n`);
    if (
      config.mode === `${attempt === 0 ? "apply" : "repair"}-interrupt` &&
      attempt === (config.failureAt ?? 0)
    ) {
      await new Promise((resolveReady, reject) => {
        const socket = createConnection(
          { host: "127.0.0.1", port: config.readyPort },
          () =>
            socket.end(
              `${JSON.stringify({ phase: attempt === 0 ? "apply" : "repair", sessionId, cycle: attempt })}\n`,
            ),
        );
        socket.on("error", reject);
        socket.on("close", resolveReady);
      });
      await new Promise(() => {});
    }
    if (config.mode === "agent-failure" && attempt === (config.failureAt ?? 0))
      throw new acp.RequestError(
        -32000,
        "fixture implementer failure after write",
      );
    if (
      config.mode === "malformed-report" &&
      attempt === (config.failureAt ?? 0)
    )
      return `not a JSON report ACP_SESSION_ID=${sessionId}`;
    const done =
      config.tasksInitiallyDone ||
      attempt >= (config.tasksDoneAt ?? config.repairsNeeded ?? 0);
    const passed = attempt >= (config.repairsNeeded ?? 0);
    const report = {
      summary: `Implementer attempt ${attempt}`,
      completedTasks: done ? ["1.1", "2.1"] : [],
      remainingTasks: done ? [] : ["1.1", "2.1"],
      blockers: implementBlockers(attempt),
      gates: config.noGates
        ? []
        : [
            {
              command: "npm test",
              exitCode: passed ? 0 : 1,
              afterEdits: true,
              attempt,
            },
          ],
      noApplicableGates: config.noGates
        ? "Documentation-only scope: project has no applicable executable gates"
        : null,
      delegatedGroups: [
        "1.1: implementation.ts ownership, completed",
        "2.1: dependent task consolidation by parent",
      ],
      sessionId,
    };
    if (attempt === 0) {
      if (config.reportFault === "duplicate-blockers")
        report.blockers = [report.blockers[0], report.blockers[0]];
      if (config.reportFault === "missing-gates") {
        report.gates = [];
        report.noApplicableGates = null;
      }
      if (config.reportFault === "stale-gates")
        report.gates[0].afterEdits = false;
      if (config.reportFault === "failed-gates") report.gates[0].exitCode = 1;
    }
    return JSON.stringify(report);
  }
  if (prompt.includes("Task-and-gate decision judge")) {
    const evidence = JSON.parse(
      prompt.split("\n").find((line) => line.startsWith('{"current":')),
    );
    const { current, report, attempt } = evidence;
    assert.equal(report.summary, `Implementer attempt ${attempt}`);
    assert.equal(current.instructions.changeName, config.changeId);
    const latest = [...before.matchAll(/^\/\/ fixture-implement-(\d+)$/gm)].at(
      -1,
    );
    assert.equal(
      Number(latest?.[1]),
      attempt,
      "judge must see post-edit snapshot",
    );
    if (config.mode === "judge-failure" && attempt === (config.failureAt ?? 0))
      throw new acp.RequestError(-32000, "fixture judge failure");
    if (
      config.mode === "malformed-judge" &&
      attempt === (config.failureAt ?? 0)
    )
      return JSON.stringify({ route: "unknown", sessionId });
    return JSON.stringify({
      route:
        config.forceEscalation && attempt === 0
          ? "escalation_required"
          : config.forceCompleted ||
              (current.tasks.every((task) => task.done) &&
                !report.blockers.length &&
                !report.remainingTasks.length &&
                (report.gates.length
                  ? report.gates.every(
                      (gate) =>
                        gate.exitCode === 0 &&
                        gate.afterEdits &&
                        gate.attempt === attempt,
                    )
                  : Boolean(report.noApplicableGates)))
            ? "completed"
            : report.blockers.some((blocker) => blocker.escalation)
              ? "escalation_required"
              : "repairable_pause",
      sessionId,
    });
  }
  if (prompt.startsWith("Read-only escalation assessment ")) {
    const payload = JSON.parse(prompt.split("\n")[1]);
    assert.equal(payload.current.instructions.changeName, config.changeId);
    assert.deepEqual(payload.prior.blockers, []);
    if (config.mode === "assessment-failure")
      throw new acp.RequestError(-32000, "fixture assessment failure");
    if (config.mode === "malformed-assessment")
      return `not JSON ACP_SESSION_ID=${sessionId}`;
    return JSON.stringify({
      ...payload.prior,
      blockers:
        config.mode === "empty-assessment"
          ? []
          : [
              {
                id: `assessment-${payload.attempt}`,
                issue: "Clarify existing approved scope",
                recommendation: "Authorize this issue only",
                escalation: true,
                scope: "design.md section 0 only",
              },
            ],
      sessionId,
    });
  }
  throw new Error(`Unexpected implement fixture prompt: ${prompt}`);
}

function verifyResolutions(cycle, report) {
  return report.findings
    .filter((finding) => finding.severity !== "SUGGESTION")
    .map((finding) => {
      const consequential =
        finding.id.endsWith("-design") || finding.id.endsWith("-product");
      return {
        id: `cycle-${cycle}-${finding.id.replace(/^finding-\d+-/, "")}`,
        findingIds: [finding.id],
        issue: finding.issue,
        recommendation: finding.recommendation,
        scope: `implementation.ts section ${cycle} for ${finding.id}; preserve approved artifacts and unrelated dirt`,
        paths: [config.artifact],
        escalation: Boolean(
          consequential && (config.escalation || config.escalationAt === cycle),
        ),
        reason: consequential
          ? "Human choice needed within this issue's precise implementation scope"
          : "Mechanical correction within approved intent",
      };
    });
}

async function verifyResponse(prompt, sessionId) {
  assert.equal(
    process.cwd(),
    config.cwd,
    "verifier must run in explicit target cwd",
  );
  assert.equal(await realpath(config.artifact), config.artifact);
  assert.ok(!config.artifact.startsWith(`${resolve(config.cwd, "openspec")}/`));
  const before = await readFile(config.artifact, "utf8");
  assert.ok(
    before.includes(config.dirtySentinel),
    "initial dirty content lost",
  );
  const cycle = [...before.matchAll(/^\/\/ fixture-verify-\d+$/gm)].length;
  const phase = prompt.startsWith("/skill:openspec-verify-change ")
    ? "verify"
    : prompt.includes("Read-only verification classifier:")
      ? "judge"
      : prompt.startsWith("Read-only verification resolution assessment ")
        ? "assess"
        : prompt.startsWith("OpenSpec verification repair ")
          ? "repair"
          : null;
  assert.ok(phase, `Unexpected verify fixture prompt: ${prompt}`);
  assert.ok(
    prompt.includes("READ-ONLY") ||
      prompt.includes("Read-only") ||
      phase === "repair",
  );
  let payload;
  if (phase === "verify") {
    assert.ok(
      prompt.startsWith(`/skill:openspec-verify-change ${config.changeId}\n`),
    );
    payload = {
      current: JSON.parse(prompt.split("CURRENT SNAPSHOT: ")[1].split("\n")[0]),
      steering: JSON.parse(
        prompt.split("ACCUMULATED SCOPED STEERING: ")[1].split("\n")[0],
      ),
    };
  } else {
    payload = JSON.parse(
      prompt.split("\n").find((line) => line.startsWith('{"current":')),
    );
  }
  assert.equal(payload.current.instructions.changeName, config.changeId);
  assert.equal(
    payload.current.instructions.changeDir,
    resolve(config.cwd, "openspec/changes", config.changeId),
  );
  assert.deepEqual(
    payload.current.instructions.contextFiles,
    config.contextFiles,
  );
  for (const paths of Object.values(payload.current.instructions.contextFiles))
    for (const path of paths)
      assert.ok((await readFile(path, "utf8")).includes(config.dirtySentinel));
  if (payload.steering) {
    const expected = Array.from(
      { length: cycle + (phase === "repair" ? 1 : 0) },
      (_, i) => verifyResolutions(i, verifyReport(i, sessionId)),
    )
      .flat()
      .filter((resolution) => resolution.escalation);
    assert.deepEqual(
      payload.steering.map((item) => item.resolution),
      expected,
      "accumulated authorization must retain original issue and path scope",
    );
    for (const item of payload.steering)
      assert.equal(
        item.answer,
        `ANSWER ${item.resolution.id}: permit only ${item.resolution.scope}`,
      );
  }
  const failure = cycle === (config.failureAt ?? 0);
  const interrupt = async () => {
    // Out-of-band readiness is sent over loopback, never via a marker/report
    // file. Tests deliver SIGINT only after the actual ACP phase is executing.
    await new Promise((resolveReady, reject) => {
      const socket = createConnection(
        { host: "127.0.0.1", port: config.readyPort },
        () => {
          socket.end(`${JSON.stringify({ phase, sessionId, cycle })}\n`);
        },
      );
      socket.on("error", reject);
      socket.on("close", resolveReady);
    });
    await new Promise(() => {});
  };
  if (failure && config.mode === `${phase}-interrupt` && phase !== "repair")
    await interrupt();
  if (failure && config.mode === `${phase}-timeout`)
    await new Promise(() => {});
  if (
    failure &&
    config.mode === `${phase}-failure` &&
    (phase !== "repair" || config.failureBeforeWrite)
  )
    throw new acp.RequestError(-32000, `fixture ${phase} failure before write`);
  if (phase === "verify") {
    assert.ok(
      prompt.includes("No sync, archive, commit, stash, reset, rollback"),
    );
    if (failure && config.mode === "malformed-report")
      return `not JSON ACP_SESSION_ID=${sessionId}`;
    return JSON.stringify(verifyReport(cycle, sessionId));
  }
  assert.equal(
    payload.report.report.split("\n")[0],
    `# Verification after ${cycle} repairs`,
    "fresh report required",
  );
  if (phase === "judge") {
    if (failure && config.mode === "malformed-judge")
      return JSON.stringify({ route: "unknown", sessionId });
    return JSON.stringify({
      route: config.forceAccepted
        ? "accepted"
        : !payload.report.conclusive
          ? "inconclusive"
          : payload.report.findings.some(
                (finding) => finding.severity !== "SUGGESTION",
              )
            ? "blocking"
            : "accepted",
      sessionId,
    });
  }
  if (phase === "assess") {
    if (failure && config.mode === "malformed-assessment")
      return JSON.stringify({ resolutions: [], sessionId });
    const resolutions = verifyResolutions(cycle, payload.report);
    if (failure && config.mode === "incomplete-assessment") resolutions.pop();
    return JSON.stringify({ resolutions, sessionId });
  }
  assert.equal(
    payload.attempt,
    cycle + 1,
    "one bounded write per repair dispatch",
  );
  assert.deepEqual(
    payload.assessment.resolutions,
    verifyResolutions(cycle, payload.report),
  );
  for (const resolution of payload.assessment.resolutions.filter(
    (item) => item.escalation,
  ))
    assert.ok(
      payload.steering.some(
        (item) =>
          JSON.stringify(item.resolution) === JSON.stringify(resolution) &&
          item.answer.trim(),
      ),
      "all consequential decisions precede edits",
    );
  assert.ok(prompt.includes("No independent SUGGESTION cleanup"));
  assert.ok(
    prompt.includes("No sync, archive, commit, stash, reset, rollback"),
  );
  // The only verifier write: bounded append to an already existing implementation file.
  await writeFile(config.artifact, `${before}// fixture-verify-${cycle + 1}\n`);
  if (failure && config.mode === "repair-interrupt") await interrupt();
  if (failure && config.mode === "repair-failure")
    throw new acp.RequestError(-32000, "fixture repair failure after write");
  if (failure && config.mode === "malformed-repair")
    return `not a repair report ACP_SESSION_ID=${sessionId}`;
  return JSON.stringify({
    summary: `Repair ${cycle + 1}; independently recheck`,
    changes: [`${config.artifact}: bounded fix`],
    unresolved: [],
    gates: [
      {
        command: "fixture integrity check",
        exitCode: 0,
        result: "original dirty sentinel preserved after edit",
      },
    ],
    sessionId,
  });
}

function verifyReport(cycle, sessionId) {
  const evidence = [
    `${config.artifact}:1`,
    `${config.contextFiles.tasks[0]}:3`,
  ];
  const findings =
    cycle < (config.repairsNeeded ?? 0)
      ? (config.mixedBlockers
          ? ["mechanical", "design", "product"]
          : [
              config.escalation || config.escalationAt === cycle
                ? "design"
                : "mechanical",
            ]
        ).map((kind) => ({
          id: `finding-${cycle}-${kind}`,
          severity: kind === "mechanical" ? "WARNING" : "CRITICAL",
          issue: `Current ${kind} implementation issue at cycle ${cycle}`,
          recommendation: `Repair only ${kind} implementation behavior; keep approved intent`,
          evidence,
        }))
      : [];
  findings.push({
    id: "optional-polish",
    severity: "SUGGESTION",
    issue: "Optional naming polish",
    recommendation: "Consider later, not in this repair",
    evidence,
  });
  const report = {
    report: `# Verification after ${cycle} repairs\n\n## Completeness\nAll current task and context artifacts inspected.\n\n## Correctness\nExisting implementation and current integrity gate checked.\n\n## Coherence\nApproved design remains the source of truth.\n\n## Findings\n${findings.map((f) => `- **${f.severity}** [${f.id}]: ${f.issue}. ${f.recommendation}. Evidence: ${f.evidence.join(", ")}`).join("\n")}\n\n## Gates\nCurrent fixture integrity checks pass.\n\nArchive-ready prose does not override blocking evidence.`,
    conclusive: !(
      config.mode === "inconclusive-report" && cycle === (config.failureAt ?? 0)
    ),
    dimensions: Object.fromEntries(
      ["completeness", "correctness", "coherence"].map((key) => [
        key,
        {
          status: "checked",
          reason: `Current ${key} evidence inspected`,
          evidence,
        },
      ]),
    ),
    findings,
    gates: [
      {
        command: "fixture integrity check",
        exitCode: 0,
        result: `Existing artifact, original dirty sentinel and ${cycle} bounded repair markers inspected`,
      },
    ],
    noApplicableGates: null,
    missingEvidence: [],
    sessionId,
  };
  if (config.inapplicableCoherence)
    report.dimensions.coherence = {
      status: "inapplicable",
      reason: "Schema has no design artifact",
      evidence: [],
    };
  if (config.noGates) {
    report.gates = [];
    report.noApplicableGates =
      "Documentation-only scope has no executable project gates";
  }
  if (cycle === (config.failureAt ?? 0)) {
    if (config.reportFault === "duplicate-findings")
      report.findings.push(report.findings[0]);
    if (config.reportFault === "missing-gates") {
      report.gates = [];
      report.noApplicableGates = null;
    }
    if (config.reportFault === "failed-gates") report.gates[0].exitCode = 1;
    if (config.reportFault === "unavailable-gates")
      report.gates[0].exitCode = null;
    if (config.reportFault === "missing-dimension")
      report.dimensions.correctness = {
        status: "missing",
        reason: "Current scenario not checked",
        evidence: [],
      };
    if (config.reportFault === "missing-evidence")
      report.missingEvidence = ["Current scenario reproduction"];
  }
  return report;
}

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
  if (verify || implement) {
    const response = await (verify ? verifyResponse : implementResponse)(
      prompt,
      params.sessionId,
    );
    await client.notify(acp.methods.client.session.update, {
      sessionId: params.sessionId,
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: response },
      },
    });
    return { stopReason: "end_turn" };
  }
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
    if (
      config.mode === "updater-failure" &&
      updates >= (config.updaterFailureAfter ?? 0)
    )
      throw new acp.RequestError(-32000, "fixture updater failure after write");
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
  .agent({
    name: verify
      ? "verify-fixture"
      : implement
        ? "implement-fixture"
        : "groom-fixture",
  })
  .onRequest("initialize", () => ({
    protocolVersion: acp.PROTOCOL_VERSION,
    agentCapabilities: { loadSession: false },
  }))
  .onRequest("authenticate", () => ({}))
  .onRequest("session/new", (ctx) => {
    assert.equal(ctx.params.cwd, process.cwd());
    if (verify) assert.equal(ctx.params.cwd, config.cwd);
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
