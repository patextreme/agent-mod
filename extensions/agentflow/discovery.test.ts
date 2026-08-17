import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  buildImportGraph,
  flowCandidates,
  listFlowNames,
  resolveFlowFile,
} from "./discovery.js";

/** Build an isolated set of project + global flow dirs for a test. */
function makeDirs(): {
  root: string;
  project: string;
  global: string;
  cleanup: () => void;
} {
  const root = mkdtempSync(join(tmpdir(), "agentflow-test-"));
  const project = join(root, "proj", ".pi", "agentflow");
  const global = join(root, "global", ".pi", "agentflow");
  mkdirSync(project, { recursive: true });
  mkdirSync(global, { recursive: true });
  return {
    root,
    project,
    global,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

/** Write a flow entry + helper into a project flow dir and return the entry. */
function writeFlow(project: string, name: string, source: string): string {
  const path = join(project, `${name}.ts`);
  writeFileSync(path, source);
  return path;
}

test("flowCandidates orders project .ts → project .js → global .ts → global .js", () => {
  const { project, global } = makeDirs();
  const candidates = flowCandidates("reviewcode", project, global);
  assert.deepEqual(candidates, [
    join(project, "reviewcode.ts"),
    join(project, "reviewcode.js"),
    join(global, "reviewcode.ts"),
    join(global, "reviewcode.js"),
  ]);
});

test("resolveFlowFile prefers a project script over a global one", () => {
  const d = makeDirs();
  try {
    writeFileSync(join(d.project, "reviewcode.ts"), "");
    writeFileSync(join(d.global, "reviewcode.ts"), "");
    const resolved = resolveFlowFile("reviewcode", join(d.root, "proj"));
    assert.ok(resolved);
    assert.equal(resolved?.path, join(d.project, "reviewcode.ts"));
    assert.equal(resolved?.isProject, true);
    assert.equal(resolved?.isTypeScript, true);
  } finally {
    d.cleanup();
  }
});

test("resolveFlowFile falls back to .js when no .ts exists", () => {
  const d = makeDirs();
  try {
    writeFileSync(join(d.project, "quick.js"), "");
    const resolved = resolveFlowFile("quick", join(d.root, "proj"));
    assert.ok(resolved);
    assert.equal(resolved?.path, join(d.project, "quick.js"));
    assert.equal(resolved?.isTypeScript, false);
  } finally {
    d.cleanup();
  }
});

test("resolveFlowFile falls back to the global dir when no project script exists", () => {
  const d = makeDirs();
  try {
    writeFileSync(join(d.global, "shared.ts"), "");
    const resolved = resolveFlowFile("shared", join(d.root, "proj"), {
      globalDir: d.global,
    });
    assert.ok(resolved);
    assert.equal(resolved?.path, join(d.global, "shared.ts"));
    assert.equal(resolved?.isProject, false);
  } finally {
    d.cleanup();
  }
});

test("resolveFlowFile returns null when no script exists", () => {
  const d = makeDirs();
  try {
    const resolved = resolveFlowFile("nope", join(d.root, "proj"));
    assert.equal(resolved, null);
  } finally {
    d.cleanup();
  }
});

test("listFlowNames merges project and global flows, deduplicating and sorting", () => {
  const d = makeDirs();
  try {
    writeFileSync(join(d.project, "reviewcode.ts"), "");
    writeFileSync(join(d.project, "quick.js"), "");
    writeFileSync(join(d.global, "shared.ts"), "");
    // Same name in both dirs → deduplicated.
    writeFileSync(join(d.project, "dup.ts"), "");
    writeFileSync(join(d.global, "dup.js"), "");
    const names = listFlowNames(join(d.root, "proj"), { globalDir: d.global });
    assert.deepEqual(names, ["dup", "quick", "reviewcode", "shared"]);
  } finally {
    d.cleanup();
  }
});

test("listFlowNames excludes .d.ts files (no phantom `agentflow.d` flow)", () => {
  const d = makeDirs();
  try {
    writeFileSync(join(d.project, "agentflow.d.ts"), "declare global {};");
    writeFileSync(join(d.project, "real.ts"), "");
    const names = listFlowNames(join(d.root, "proj"), { globalDir: d.global });
    assert.deepEqual(names, ["real"]);
  } finally {
    d.cleanup();
  }
});

test("resolveFlowFile never resolves a .d.ts file as a flow", () => {
  const d = makeDirs();
  try {
    // `agentflow.d.ts` is a declaration file: the name `agentflow.d` must not
    // resolve to it, even though `<name>.ts` nominally matches.
    writeFileSync(join(d.project, "agentflow.d.ts"), "declare global {};");
    assert.equal(resolveFlowFile("agentflow.d", join(d.root, "proj")), null);
  } finally {
    d.cleanup();
  }
});

test("listFlowNames returns empty when no flow dirs exist", () => {
  const d = makeDirs();
  try {
    const names = listFlowNames(join(d.root, "proj"), { globalDir: d.global });
    assert.deepEqual(names, []);
  } finally {
    d.cleanup();
  }
});

test("buildImportGraph accepts TypeScript-only syntax in an import-less entry", () => {
  // `interface`/`type`/generics are plain-JS parse errors — the walk must run
  // jiti's TS transform for `.ts` files or a valid flow is rejected. (Syntax
  // validation is the walker's job now: it transforms every graph file, the
  // entry included, so a parse failure aborts before any sub-agent spawns.)
  const d = makeDirs();
  try {
    const entry = writeFlow(
      d.project,
      "plain",
      "\ninterface R { ok: boolean }\ntype V = { n: number };\nconst pick = (r: R, v: V): string => af.log(r.ok, v.n);\n",
    );
    const graph = buildImportGraph(entry);
    assert.deepEqual([...graph.files.keys()], [entry]);
    assert.equal(graph.edges.length, 0);
  } finally {
    d.cleanup();
  }
});

test("buildImportGraph rejects a syntax error in the entry file, naming it", () => {
  // jiti does not throw on a parse failure — it signs the failure by emitting
  // an `exports.__JITI_ERROR__` assignment into the transpiled output (for
  // `.ts` and `.js` alike). The walker must surface that sentinel as a thrown
  // error instead of passing the error-encoded source through, which would
  // otherwise fail at runtime as a confusing "exports is not defined".
  const d = makeDirs();
  try {
    const badTs = writeFlow(d.project, "broken", "const x: number =\n");
    writeFileSync(join(d.project, "broken.js"), "const x = ;\n");
    for (const [path, name] of [
      [badTs, "broken.ts"],
      [join(d.project, "broken.js"), "broken.js"],
    ] as const) {
      assert.throws(
        () => buildImportGraph(path),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.match(err.message, /AgentFlow: syntax error in/);
          assert.match(err.message, new RegExp(name.replace(/\./g, "\\.")));
          return true;
        },
      );
    }
  } finally {
    d.cleanup();
  }
});

// ─── Import-graph walker ────────────────────────────────────────────────────

test("buildImportGraph resolves relative value imports and walks them", () => {
  const d = makeDirs();
  try {
    writeFileSync(
      join(d.project, "helper.ts"),
      "export const MAGIC = 41;\nexport function hi(): string { return af.cwd; }\n",
    );
    const entry = writeFlow(
      d.project,
      "entry",
      'import { MAGIC, hi } from "./helper.ts";\naf.log(MAGIC, hi());\n',
    );
    const graph = buildImportGraph(entry);
    assert.deepEqual(
      [...graph.files.keys()],
      [entry, join(d.project, "helper.ts")],
    );
    assert.equal(graph.edges.length, 1);
    assert.equal(graph.edges[0].kind, "value");
    assert.equal(graph.edges[0].specifier, "./helper.ts");
    assert.equal(graph.edges[0].resolved, join(d.project, "helper.ts"));
  } finally {
    d.cleanup();
  }
});

test("buildImportGraph allows `../` escapes above the flow directory", () => {
  const d = makeDirs();
  try {
    mkdirSync(join(d.root, "proj", "shared"));
    writeFileSync(
      join(d.root, "proj", "shared", "util.ts"),
      "export const x = 1;\n",
    );
    const entry = writeFlow(
      d.project,
      "escape",
      'import { x } from "../../shared/util.ts";\naf.log(x);\n',
    );
    const graph = buildImportGraph(entry);
    assert.equal(
      graph.edges[0].resolved,
      join(d.root, "proj", "shared", "util.ts"),
    );
  } finally {
    d.cleanup();
  }
});

test("buildImportGraph rejects imports that escape the inferred project root", () => {
  const d = makeDirs();
  try {
    writeFileSync(join(d.root, "outside.ts"), "export const secret = 1;\n");
    const entry = writeFlow(
      d.project,
      "root-escape",
      'import { secret } from "../../../outside.ts";\naf.log(secret);\n',
    );
    assert.throws(() => buildImportGraph(entry), /escapes the flow root/);
  } finally {
    d.cleanup();
  }
});

test("buildImportGraph resolves extensionless specifiers like TypeScript (ts preferred over js)", () => {
  const d = makeDirs();
  try {
    // Both files exist: TypeScript's Bundler resolver picks `mod.ts`, so the
    // validation graph must pick the same file jiti will execute.
    writeFileSync(join(d.project, "mod.ts"), "export const y = 'ts';\n");
    writeFileSync(join(d.project, "mod.js"), "export const y = 'js';\n");
    const entry = writeFlow(
      d.project,
      "preferred",
      'import { y } from "./mod";\naf.log(y);\n',
    );
    const graph = buildImportGraph(entry);
    assert.equal(graph.edges[0].resolved, join(d.project, "mod.ts"));
  } finally {
    d.cleanup();
  }
});

test("buildImportGraph walks extensionless specifiers via probing", () => {
  const d = makeDirs();
  try {
    writeFileSync(join(d.project, "mod.ts"), "export const y = 2;\n");
    const entry = writeFlow(
      d.project,
      "probe",
      'import { y } from "./mod";\naf.log(y);\n',
    );
    const graph = buildImportGraph(entry);
    assert.equal(graph.edges[0].resolved, join(d.project, "mod.ts"));
  } finally {
    d.cleanup();
  }
});

test("buildImportGraph records type-only edges and stops at .d.ts files", () => {
  const d = makeDirs();
  try {
    writeFileSync(
      join(d.project, "agentflow.d.ts"),
      "export interface Finding { ok: boolean }\ndeclare global { const af: { log(...parts: unknown[]): void } }\n",
    );
    const entry = writeFlow(
      d.project,
      "typed",
      'import type { Finding } from "./agentflow.d.ts";\nconst f: Finding = { ok: true };\naf.log(f.ok);\n',
    );
    const graph = buildImportGraph(entry);
    // Type edge to the declaration file, which is terminal (its own `typebox`
    // import must never enter a flow's graph).
    assert.equal(graph.edges.length, 1);
    assert.equal(graph.edges[0].kind, "type");
    assert.equal(graph.edges[0].resolved, join(d.project, "agentflow.d.ts"));
    assert.ok(graph.files.has(join(d.project, "agentflow.d.ts")));
  } finally {
    d.cleanup();
  }
});

test("buildImportGraph rejects a non-literal require argument", () => {
  // `require("./legacy.cjs" + suffix)` is not statically resolvable, so it must
  // be rejected instead of truncated to its first literal chunk.
  const d = makeDirs();
  try {
    const entry = writeFlow(
      d.project,
      "dynamic-require",
      'const m = require("./legacy.cjs" + suffix);\naf.log(m);\n',
    );
    assert.throws(
      () => buildImportGraph(entry),
      /require\(\) with a non-literal argument/,
    );
  } finally {
    d.cleanup();
  }
});

test("buildImportGraph rejects a wrapped `(0, require)` bare specifier", () => {
  // `jiti` leaves `(0, require)(...)` untouched, but it is a live require call
  // at runtime and must not bypass the relative-only policy.
  const d = makeDirs();
  try {
    const entry = writeFlow(
      d.project,
      "wrapped-require-bare",
      'const cp = (0, require)("node:child_process");\naf.log(cp.execSync("whoami").toString());\n',
    );
    assert.throws(() => buildImportGraph(entry), /bare specifier "node:child_process"/);
  } finally {
    d.cleanup();
  }
});

test("buildImportGraph rejects an unresolved require reference", () => {
  // `const r = (0, require); r("node:os")` would otherwise contain no direct
  // require() call and no collected alias: it must be rejected instead of
  // validating with zero import edges.
  const d = makeDirs();
  try {
    const entry = writeFlow(
      d.project,
      "unresolved-require-reference",
      'const r = (0, require);\naf.log(r("node:os"));\n',
    );
    assert.throws(
      () => buildImportGraph(entry),
      /require usage cannot be statically verified/,
    );
  } finally {
    d.cleanup();
  }
});

test("buildImportGraph rejects a require-derived callable expression", () => {
  // `require.bind(null)` returns a live require function; the guard must not
  // mistake it for the exact `const r = require` alias because the `require`
  // token is followed by `.bind(...)` rather than a statement end.
  const d = makeDirs();
  try {
    const entry = writeFlow(
      d.project,
      "require-bind-reference",
      'const r = require.bind(null);\naf.log(r("node:os"));\n',
    );
    assert.throws(
      () => buildImportGraph(entry),
      /require usage cannot be statically verified/,
    );
  } finally {
    d.cleanup();
  }
});

test("buildImportGraph does not treat a direct require result as a require alias", () => {
  // The alias collector must skip `require("literal")` when the next token is
  // `(`; otherwise a later `handler(dynamicExpr)` call is misidentified as an
  // aliased require call and rejected.
  const d = makeDirs();
  try {
    writeFileSync(
      join(d.project, "handler.cjs"),
      "module.exports = function (x) { return x; };\n",
    );
    const entry = writeFlow(
      d.project,
      "direct-require-not-alias",
      'const handler = require("./handler.cjs");\naf.log(handler(dynamicExpr));\n',
    );
    const graph = buildImportGraph(entry);
    assert.equal(graph.edges.length, 1);
    assert.equal(graph.edges[0].specifier, "./handler.cjs");
  } finally {
    d.cleanup();
  }
});

test("buildImportGraph rejects CommonJS export syntax in the entry", () => {
  // Imported `.cjs` helpers may still use `module.exports`, but a flow entry
  // using it is a silent no-op and must fail validation with a clear message.
  const d = makeDirs();
  try {
    const entry = writeFlow(
      d.project,
      "cjs-export-entry",
      'module.exports = async function () {\n  await af.bash("echo hi");\n};\n',
    );
    assert.throws(() => buildImportGraph(entry), /CommonJS export syntax/);
  } finally {
    d.cleanup();
  }
});

test("buildImportGraph rejects a bare specifier passed through an aliased require", () => {
  const d = makeDirs();
  try {
    const entry = writeFlow(
      d.project,
      "alias-bare",
      'const r = require;\naf.log(r("node:os"));\n',
    );
    assert.throws(() => buildImportGraph(entry), /bare specifier "node:os"/);
  } finally {
    d.cleanup();
  }
});

test("buildImportGraph walks a relative require passed through an alias", () => {
  const d = makeDirs();
  try {
    writeFileSync(
      join(d.project, "legacy.cjs"),
      "module.exports = { n: 4 };\n",
    );
    const entry = writeFlow(
      d.project,
      "alias-relative",
      'const r = require;\naf.log(r("./legacy.cjs").n);\n',
    );
    const graph = buildImportGraph(entry);
    assert.equal(graph.edges[0].kind, "value");
    assert.equal(graph.edges[0].specifier, "./legacy.cjs");
  } finally {
    d.cleanup();
  }
});

test("buildImportGraph tolerates CommonJS require of relative files", () => {
  const d = makeDirs();
  try {
    writeFileSync(
      join(d.project, "legacy.cjs"),
      "module.exports = { n: 3 };\n",
    );
    const entry = writeFlow(
      d.project,
      "cjs",
      'const legacy = require("./legacy.cjs");\naf.log(legacy.n);\n',
    );
    const graph = buildImportGraph(entry);
    assert.equal(graph.edges[0].kind, "value");
    assert.equal(graph.edges[0].specifier, "./legacy.cjs");
  } finally {
    d.cleanup();
  }
});

test("buildImportGraph rejects bare specifiers with a located error", () => {
  const d = makeDirs();
  try {
    const entry = writeFlow(
      d.project,
      "bare",
      'import { z } from "zod";\naf.log(z);\n',
    );
    assert.throws(
      () => buildImportGraph(entry),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /import error in /);
        assert.match(err.message, /bare specifier "zod"/);
        assert.match(err.message, /\(1:19\)/);
        return true;
      },
    );
  } finally {
    d.cleanup();
  }
});

test("buildImportGraph rejects `node:` builtin specifiers", () => {
  const d = makeDirs();
  try {
    const entry = writeFlow(
      d.project,
      "nodefs",
      'import { readFile } from "node:fs/promises";\naf.log(readFile);\n',
    );
    assert.throws(
      () => buildImportGraph(entry),
      /import error in .*node:fs\/promises.*must be relative/,
    );
  } finally {
    d.cleanup();
  }
});

test("buildImportGraph rejects dynamic import() with a located error", () => {
  const d = makeDirs();
  try {
    const entry = writeFlow(
      d.project,
      "dynamic",
      'const mod = await import("./helper.ts");\naf.log(mod);\n',
    );
    assert.throws(
      () => buildImportGraph(entry),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /dynamic import\(\) is not allowed/);
        assert.match(err.message, /\(1:19\)/);
        return true;
      },
    );
  } finally {
    d.cleanup();
  }
});

test("buildImportGraph rejects dynamic import() in a ternary false branch", () => {
  // Real runtime import expressions hide in ordinary expressions; jiti lowers
  // them to `jitiImport(...)`, so the walker must reject them after transform.
  const d = makeDirs();
  try {
    const entry = writeFlow(
      d.project,
      "ternary-dynamic",
      'const mod = cond ? a : import("./helper.ts");\naf.log(mod);\n',
    );
    assert.throws(
      () => buildImportGraph(entry),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /dynamic import\(\) is not allowed/);
        return true;
      },
    );
  } finally {
    d.cleanup();
  }
});

test("buildImportGraph locates a real dynamic import after an optional type annotation", () => {
  // `cb?: import("./helper.ts").T` is an optional-parameter type annotation and
  // is erased; the dynamic-import error must point at the real `import()` on
  // the following line rather than the harmless type-position import.
  const d = makeDirs();
  try {
    writeFileSync(join(d.project, "helper.ts"), "export type T = string;\n");
    const entry = writeFlow(
      d.project,
      "optional-type-dynamic",
      'function f(cb?: import("./helper.ts").T) {}\nconst bad = import("./oops.ts");\naf.log(f, bad);\n',
    );
    assert.throws(
      () => buildImportGraph(entry),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /dynamic import\(\) is not allowed/);
        assert.match(err.message, /\(2:13\)/);
        return true;
      },
    );
  } finally {
    d.cleanup();
  }
});

test("buildImportGraph rejects dynamic import() mentioned in a comment or string", () => {
  // Only real code trips the dynamic-import guard — prose in comments and
  // string literals must not (a bash command or guidance text often mentions
  // `import(`).
  const d = makeDirs();
  try {
    const entry = writeFlow(
      d.project,
      "dynamic-ok",
      '// do not use import("./x.ts") here\naf.log("docs say import( is banned");\naf.log("ok");\n',
    );
    const graph = buildImportGraph(entry);
    assert.equal(graph.edges.length, 0);
  } finally {
    d.cleanup();
  }
});

test('buildImportGraph accepts type-position import("./x").T (erased, not dynamic)', () => {
  const d = makeDirs();
  try {
    writeFileSync(join(d.project, "nums.ts"), "export type Num = number;\n");
    const entry = writeFlow(
      d.project,
      "typdyn-ok",
      'const n: import("./nums.ts").Num = 1;\nconst also: Array<import("./nums.ts").Num> = [n];\naf.log(n, also[0]);\n',
    );
    const graph = buildImportGraph(entry);
    // No value or type edges: the annotation is erased by transpilation.
    assert.equal(graph.edges.length, 0);
  } finally {
    d.cleanup();
  }
});

test('buildImportGraph accepts type-alias import("./x").T (erased, not dynamic)', () => {
  const d = makeDirs();
  try {
    writeFileSync(join(d.project, "nums.ts"), "export type Num = number;\n");
    const entry = writeFlow(
      d.project,
      "typalias-ok",
      'type N = import("./nums.ts").Num;\nconst n: N = 1;\naf.log(n);\n',
    );
    const graph = buildImportGraph(entry);
    // No value or type edges: the annotation is erased by transpilation.
    assert.equal(graph.edges.length, 0);
  } finally {
    d.cleanup();
  }
});

test("buildImportGraph records inline `{ type X }` imports/exports as type edges", () => {
  const d = makeDirs();
  try {
    writeFileSync(join(d.project, "nums.ts"), "export type Num = number;\n");
    const entry = writeFlow(
      d.project,
      "inline-type",
      'import { type Num } from "./nums.ts";\nexport { type Num } from "./nums.ts";\nconst n: Num = 1;\naf.log(n);\n',
    );
    const graph = buildImportGraph(entry);
    assert.equal(graph.edges.length, 1);
    assert.equal(graph.edges[0].kind, "type");
    assert.equal(graph.edges[0].specifier, "./nums.ts");
  } finally {
    d.cleanup();
  }
});

test("buildImportGraph rejects a bare specifier in an inline `import { type X }`", () => {
  const d = makeDirs();
  try {
    const entry = writeFlow(
      d.project,
      "inline-bare",
      'import { type X } from "zod";\nconst x: X = {} as X;\naf.log(x);\n',
    );
    assert.throws(
      () => buildImportGraph(entry),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /bare specifier "zod"/);
        return true;
      },
    );
  } finally {
    d.cleanup();
  }
});

test("buildImportGraph rejects a bare unmarked type-position import", () => {
  // `import { z } from "zod"` used only as a type annotation is erased by
  // jiti's TS transform. The walker must still enforce the relative-only
  // policy against the source declaration, not only against surviving
  // `require()` calls.
  const d = makeDirs();
  try {
    const entry = writeFlow(
      d.project,
      "unmarked-bare",
      'import { z } from "zod";\nconst x: z = {} as z;\naf.log(x);\n',
    );
    assert.throws(
      () => buildImportGraph(entry),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /bare specifier "zod"/);
        return true;
      },
    );
  } finally {
    d.cleanup();
  }
});

test("buildImportGraph rejects an unmarked type-position `node:` import", () => {
  const d = makeDirs();
  try {
    const entry = writeFlow(
      d.project,
      "unmarked-node",
      'import { readFile } from "node:fs/promises";\nconst f: typeof readFile = undefined as unknown as typeof readFile;\naf.log(f);\n',
    );
    assert.throws(
      () => buildImportGraph(entry),
      /import error in .*node:fs\/promises.*must be relative/,
    );
  } finally {
    d.cleanup();
  }
});

test("buildImportGraph rejects an unmarked type-position .d.ts import", () => {
  const d = makeDirs();
  try {
    writeFileSync(
      join(d.project, "agentflow.d.ts"),
      "export interface Finding { ok: boolean }\n",
    );
    const entry = writeFlow(
      d.project,
      "unmarked-dts",
      'import { Finding } from "./agentflow.d.ts";\nconst f: Finding = { ok: true };\naf.log(f.ok);\n',
    );
    assert.throws(
      () => buildImportGraph(entry),
      /declaration files can only be imported for types.*agentflow\.d\.ts/,
    );
  } finally {
    d.cleanup();
  }
});

test("buildImportGraph records an unmarked type-position relative import as a type edge", () => {
  const d = makeDirs();
  try {
    writeFileSync(
      join(d.project, "nums.ts"),
      "export interface Num { n: number }\n",
    );
    const entry = writeFlow(
      d.project,
      "unmarked-relative",
      'import { Num } from "./nums.ts";\nconst n: Num = { n: 1 };\naf.log(n);\n',
    );
    const graph = buildImportGraph(entry);
    assert.equal(graph.edges.length, 1);
    assert.equal(graph.edges[0].kind, "type");
    assert.equal(graph.edges[0].resolved, join(d.project, "nums.ts"));
    assert.ok(graph.files.has(join(d.project, "nums.ts")));
  } finally {
    d.cleanup();
  }
});

test("buildImportGraph deduplicates symlinked cyclic imports", () => {
  const d = makeDirs();
  try {
    writeFileSync(
      join(d.project, "a.ts"),
      'import { b } from "./b.ts";\nexport const a = 1;\naf.log(b);\n',
    );
    writeFileSync(
      join(d.project, "b.ts"),
      'import { a } from "./a.ts";\nexport const b = a + 1;\n',
    );
    const link = join(d.root, "linked");
    symlinkSync(d.project, link, "dir");
    const linkedEntry = join(link, "a.ts");

    const graph = buildImportGraph(linkedEntry);

    assert.equal(graph.entry, realpathSync(join(d.project, "a.ts")));
    assert.equal(graph.files.size, 2);
    assert.deepEqual(
      [...graph.files.keys()].sort(),
      [
        realpathSync(join(d.project, "a.ts")),
        realpathSync(join(d.project, "b.ts")),
      ].sort(),
    );
  } finally {
    d.cleanup();
  }
});

test("buildImportGraph rejects a missing import target with a located error", () => {
  const d = makeDirs();
  try {
    const entry = writeFlow(
      d.project,
      "missing",
      'import { gone } from "./gone.ts";\naf.log(gone);\n',
    );
    assert.throws(
      () => buildImportGraph(entry),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /cannot resolve import "\.\/gone\.ts"/);
        assert.match(err.message, /\(1:22\)/);
        return true;
      },
    );
  } finally {
    d.cleanup();
  }
});

test("buildImportGraph reports a missing local agentflow.d.ts as unresolved (not an escape)", () => {
  const d = makeDirs();
  try {
    // No local `agentflow.d.ts` is written. jiti would otherwise fall back to
    // the declaration bundled next to `discovery.ts` and report an escape;
    // the walker must resolve declaration imports against the importing file's
    // directory instead.
    const entry = writeFlow(
      d.project,
      "nodecl",
      'import type { AgentFlow } from "./agentflow.d.ts";\nconst a: AgentFlow = af;\naf.log(a.cwd);\n',
    );
    assert.throws(
      () => buildImportGraph(entry),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(
          err.message,
          /cannot resolve import "\.\/agentflow\.d\.ts"/,
        );
        assert.match(err.message, /\/af-init/);
        return true;
      },
    );
  } finally {
    d.cleanup();
  }
});

test("buildImportGraph rejects value imports of .d.ts files", () => {
  const d = makeDirs();
  try {
    writeFileSync(
      join(d.project, "agentflow.d.ts"),
      "export interface Finding { ok: boolean }\n",
    );
    // The binding is used, so the import survives jiti's elision as a value
    // edge and is rejected.
    const entry = writeFlow(
      d.project,
      "valdecl",
      'import { Finding } from "./agentflow.d.ts";\naf.log(Finding);\n',
    );
    assert.throws(
      () => buildImportGraph(entry),
      /declaration files can only be imported for types.*agentflow\.d\.ts/,
    );
  } finally {
    d.cleanup();
  }
});

test("buildImportGraph rejects a syntax error in an imported helper, naming the helper", () => {
  const d = makeDirs();
  try {
    writeFileSync(
      join(d.project, "broken-helper.ts"),
      "export const x: number =\n",
    );
    const entry = writeFlow(
      d.project,
      "badhelper",
      'import { x } from "./broken-helper.ts";\naf.log(x);\n',
    );
    assert.throws(
      () => buildImportGraph(entry),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /syntax error in ".*broken-helper\.ts"/);
        return true;
      },
    );
  } finally {
    d.cleanup();
  }
});

test("buildImportGraph ignores import-type text inside a string literal", () => {
  const d = makeDirs();
  try {
    const entry = writeFlow(
      d.project,
      "import-like-string",
      "af.log(\"import type { X } from './doesnotexist.ts'\");\n",
    );
    const graph = buildImportGraph(entry);
    assert.equal(graph.edges.length, 0);
  } finally {
    d.cleanup();
  }
});

test("buildImportGraph ignores `require(...)` mentioned in comments and strings", () => {
  // The old guard's concern, carried over to the walker: prose in comments
  // (jiti keeps them in its output) and string literals (e.g. a grep command)
  // must not read as import edges.
  const d = makeDirs();
  try {
    const entry = writeFlow(
      d.project,
      "prose",
      [
        '// NOTE: do not require("left-pad") here — only `af`',
        "af.bash(\"grep -rn 'require(' src\")",
        'af.log("call require(x) here, see module.exports docs")',
        "const pkg = { exports: { x: 1 } };",
        "af.log(pkg.exports.x);",
        "",
      ].join("\n"),
    );
    const graph = buildImportGraph(entry);
    assert.equal(graph.edges.length, 0);
  } finally {
    d.cleanup();
  }
});

test("buildImportGraph handles cyclic imports without looping", () => {
  const d = makeDirs();
  try {
    writeFileSync(
      join(d.project, "a.ts"),
      'import { b } from "./b.ts";\nexport const a = 1;\naf.log(b);\n',
    );
    const entry = writeFlow(
      d.project,
      "cyc",
      'import { a } from "./a.ts";\naf.log(a);\n',
    );
    writeFileSync(
      join(d.project, "b.ts"),
      'import { a } from "./a.ts";\nexport const b = a + 1;\n',
    );
    const graph = buildImportGraph(entry);
    assert.equal(graph.files.size, 3); // entry + a + b, each visited once
  } finally {
    d.cleanup();
  }
});
