import assert from "node:assert/strict";
import { lstat, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { TestContext } from "node:test";
import { FlowRunner, type FlowRunState } from "acpx/flows";
import { fixture as finalizeFixture } from "../openspec-finalize/test-fixture.js";
import type { Command } from "../shared/command.js";
import { type AllDependencies, createAllFlow } from "./flow.js";
import type { AllResult, Stage } from "./helpers.js";

export interface Options {
  noDelta?: boolean;
  groomRepairs?: number;
  implementRepairs?: number;
  verifyRepairs?: number;
  escalation?: Stage;
  fail?: string;
}
export async function fixture(
  t: TestContext,
  options: Options = {},
  dependencies: AllDependencies = {},
) {
  const f = await finalizeFixture(t, { noDelta: options.noDelta });
  const planning = join(f.changeRoot, "proposal.md");
  const tasks = join(f.changeRoot, "tasks.md");
  const implementation = join(f.cwd, "implementation.ts");
  await writeFile(planning, "# Proposal\nKEEP DIRTY PLANNING EDIT\n");
  await writeFile(
    tasks,
    "- [x] 1.1 Implement approved behavior\nKEEP DIRTY TASK EDIT\n",
  );
  await writeFile(implementation, "// KEEP DIRTY IMPLEMENTATION EDIT\n");
  Object.assign(f.status.artifactPaths, {
    proposal: { existingOutputPaths: [planning] },
    tasks: { existingOutputPaths: [tasks] },
  });
  const artifacts = [
    planning,
    tasks,
    ...(options.noDelta ? [] : [f.deltaPath, f.freshPath]),
  ];
  const config = {
    ...f.config,
    planning,
    implementation,
    artifacts,
    ...options,
  };
  await writeFile(join(f.cwd, ".all-fixture.json"), JSON.stringify(config));
  const calls: string[][] = [];
  const command: Command = async (args, cwd, signal) => {
    assert.equal(cwd, f.cwd);
    calls.push(args);
    signal?.throwIfAborted();
    const json = (value: unknown) => ({
      stdout: JSON.stringify(value),
      stderr: "",
      exitCode: 0,
    });
    if (args[0] === "list") {
      let active = false;
      try {
        active = (await lstat(f.changeRoot)).isDirectory();
      } catch {
        /* Archived. */
      }
      return json({ ...f.listing, changes: active ? f.listing.changes : [] });
    }
    if (args[0] === "validate")
      return json({
        items: [{ id: f.id, type: "change", valid: true, issues: [] }],
      });
    if (args[0] === "instructions" && args[1] === "apply")
      return json({
        changeName: f.id,
        changeDir: f.changeRoot,
        state: "all_done",
        tasks: [
          { id: "1.1", description: "Implement approved behavior", done: true },
        ],
        contextFiles: {
          proposal: [planning],
          tasks: [tasks],
          specs: options.noDelta ? [] : [f.deltaPath, f.freshPath],
        },
        instruction: "Follow approved fixture scope; preserve dirty edits",
        context: "fixture gate required",
      });
    return f.command(args, cwd, signal);
  };
  const fakeAgent = new URL("./fixtures/fake-agent.mjs", import.meta.url)
    .pathname;
  const runner = new FlowRunner({
    resolveAgent: (profile) => {
      assert.ok(profile === undefined || profile === "pi");
      return {
        agentName: "pi",
        agentCommand: `${process.execPath} ${fakeAgent}`,
        agentArgv: [process.execPath, fakeAgent],
        cwd: f.cwd,
      };
    },
    permissionMode: "approve-reads",
    defaultNodeTimeoutMs: 10000,
    suppressSdkConsoleErrors: true,
    outputRoot: join(f.base, "runs"),
  });
  const emitted: AllResult[] = [];
  const messages: string[] = [];
  const deps: AllDependencies = {
    cwd: f.cwd,
    command,
    now: () => new Date("2026-10-05Z"),
    emit: (r) => emitted.push(r),
    progress: (s) => messages.push(s),
    ...dependencies,
  };
  const flow = createAllFlow(deps);
  const destination = join(f.changesDir, "archive", `2026-10-05-${f.id}`);
  async function states() {
    const runs = await readdir(join(f.base, "runs"));
    return Promise.all(
      runs.map(
        async (run) =>
          JSON.parse(
            await readFile(
              join(f.base, "runs", run, "projections/run.json"),
              "utf8",
            ),
          ) as FlowRunState,
      ),
    );
  }
  return {
    ...f,
    planning,
    tasks,
    implementation,
    config,
    artifacts,
    calls,
    command,
    runner,
    emitted,
    messages,
    deps,
    flow,
    destination,
    states,
  };
}
