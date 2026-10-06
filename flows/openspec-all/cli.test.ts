import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmod, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import type { AllResult } from "./helpers.js";
import { fixture } from "./test-fixture.js";

for (const mode of ["success", "needs_human", "failed"] as const)
  test(`actual openspec-all CLI ${mode} has one aggregate, visible stage status and correct exit`, {
    timeout: 60000,
  }, async (t) => {
    const f = await fixture(
      t,
      mode === "needs_human"
        ? { escalation: "implement", implementRepairs: 1 }
        : mode === "failed"
          ? { fail: "verify:inconclusive" }
          : {},
    );
    const home = join(f.base, "home");
    const bin = join(f.base, "bin");
    await mkdir(join(home, ".acpx"), { recursive: true });
    await mkdir(bin);
    const fakeAgent = new URL("./fixtures/fake-agent.mjs", import.meta.url)
      .pathname;
    await writeFile(
      join(home, ".acpx/config.json"),
      JSON.stringify({
        agents: { pi: { argv: [process.execPath, fakeAgent] } },
      }),
    );
    const openspec = join(bin, "openspec");
    const apply = {
      changeName: f.id,
      changeDir: f.changeRoot,
      state: "all_done",
      tasks: [
        { id: "1.1", description: "Implement approved behavior", done: true },
      ],
      contextFiles: {
        proposal: [f.planning],
        tasks: [f.tasks],
        specs: [f.deltaPath, f.freshPath],
      },
      instruction: "Approved scope only",
      context: "fixture gate required",
    };
    await writeFile(
      openspec,
      `#!${process.execPath}\nconst fs=require("node:fs");const config=JSON.parse(fs.readFileSync(${JSON.stringify(join(f.cwd, ".all-fixture.json"))},"utf8"));const args=process.argv.slice(2);let value;if(args[0]==="list")value={...config.listing,changes:fs.existsSync(config.status.changeRoot)?config.listing.changes:[]};else if(args[0]==="status")value=config.status;else if(args[0]==="validate")value={items:[{id:config.changeId,type:"change",valid:true,issues:[]}]};else if(args[0]==="instructions"&&args[1]==="apply")value=${JSON.stringify(apply)};else if(args[0]==="instructions"&&args[1]==="specs")value=config.instructions;else throw Error("Forbidden command "+args);process.stdout.write(JSON.stringify(value));\n`,
    );
    await chmod(openspec, 0o755);
    const child = spawn(
      process.execPath,
      [
        new URL("../../node_modules/acpx/dist/cli.js", import.meta.url)
          .pathname,
        "flow",
        "run",
        new URL("./index.ts", import.meta.url).pathname,
        "--input-json",
        JSON.stringify({ changeId: f.id }),
      ],
      {
        cwd: f.cwd,
        env: { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}` },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), 50000);
    const code = await new Promise<number | null>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    }).finally(() => clearTimeout(timer));
    const results = stdout
      .split("\n")
      .filter((line) => line.startsWith('{"changeId":'))
      .map((line) => JSON.parse(line) as AllResult);
    assert.equal(results.length, 1, stdout + stderr);
    assert.equal(results[0].outcome, mode);
    assert.equal(code === 0, mode === "success", stderr);
    assert.match(stderr, /\[openspec-all:groom\] starting/);
    assert.match(stderr, new RegExp(`${f.id}: ${mode}`));
    if (mode === "needs_human") {
      assert.match(
        stderr,
        /\[openspec-all:implement\] paused for scoped human steering/,
      );
      assert.match(results[0].stages[1].result?.summary ?? "", /TTYs/);
      assert.equal(results[0].stages[2].status, "not_started");
    }
    assert.ok(
      !stdout
        .split("\n")
        .some(
          (line) =>
            line.startsWith('{"changeId":') && !line.includes('"stages":'),
        ),
      "constituent emitters are captured, not printed",
    );
    const [run] = await readdir(join(home, ".acpx/flows/runs"));
    assert.ok(
      await readFile(
        join(home, ".acpx/flows/runs", run, "trace.ndjson"),
        "utf8",
      ),
    );
    await f.unchanged();
  });
