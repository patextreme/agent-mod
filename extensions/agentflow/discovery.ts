/**
 * discovery.ts — Flow script discovery, loading, and validation.
 *
 * A flow is resolved by name to a concrete script file, then its static
 * import graph is walked (relative-only import policy, target existence,
 * syntax of every graph file) and — for `.ts` — the script is type-checked
 * against the `af` declarations (shipped, or a local `agentflow.d.ts` copy
 * the graph already contains) before execution.
 */

import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { createJiti } from "jiti";

/** Result of resolving a flow name to a script file. */
export interface ResolvedFlow {
  /** Absolute path to the resolved script file. */
  path: string;
  /** True when the script lives in the project's `.pi/agentflow/` (trust-gated). */
  isProject: boolean;
  /** True when the script is a TypeScript file (needs type-checking). */
  isTypeScript: boolean;
}

/** The project-local flow directory, relative to a working directory. */
export const PROJECT_FLOW_DIR = ".pi/agentflow";
/** The global flow directory, relative to the user's home directory. */
export const GLOBAL_FLOW_DIR = ".pi/agentflow";

/**
 * Build the ordered candidate paths for a flow name, project-first.
 * Pure / testable: does not touch the filesystem.
 */
export function flowCandidates(
  name: string,
  projectDir: string,
  globalDir: string,
): string[] {
  return [
    join(projectDir, `${name}.ts`),
    join(projectDir, `${name}.js`),
    join(globalDir, `${name}.ts`),
    join(globalDir, `${name}.js`),
  ];
}

/**
 * Resolve a flow by name to a script file.
 *
 * Search order (first match wins):
 *   1. project `.pi/agentflow/<name>.ts`
 *   2. project `.pi/agentflow/<name>.js`
 *   3. global `~/.pi/agentflow/<name>.ts`
 *   4. global `~/.pi/agentflow/<name>.js`
 *
 * Declaration files (`.d.ts`) are never flows: a candidate resolving to one
 * (e.g. the name `agentflow.d`) is skipped. Returns null when no `.ts`/`.js`
 * file exists for the flow name.
 */
export function resolveFlowFile(
  name: string,
  cwd: string,
  options?: { globalDir?: string },
): ResolvedFlow | null {
  const projectDir = join(cwd, PROJECT_FLOW_DIR);
  const globalDir = options?.globalDir ?? join(homedir(), GLOBAL_FLOW_DIR);
  const candidates = flowCandidates(name, projectDir, globalDir);

  for (let i = 0; i < candidates.length; i++) {
    // `.d.ts` files are declarations, not runnable flows — a name like
    // `agentflow.d` must not resolve to `agentflow.d.ts`.
    if (candidates[i].endsWith(".d.ts")) continue;
    if (existsSync(candidates[i])) {
      return {
        path: candidates[i],
        isProject: i < 2,
        isTypeScript: candidates[i].endsWith(".ts"),
      };
    }
  }
  return null;
}

/**
 * List every discoverable flow name, across the project and global flow dirs.
 * Project and global names are merged (deduplicated); each name is a `.ts` or
 * `.js` file basename. Declaration files (`.d.ts`) are excluded — they are
 * types for scripts, not flows. Used to register per-flow `/af:<name>`
 * shortcut commands.
 */
export function listFlowNames(
  cwd: string,
  options?: { globalDir?: string },
): string[] {
  const projectDir = join(cwd, PROJECT_FLOW_DIR);
  const globalDir = options?.globalDir ?? join(homedir(), GLOBAL_FLOW_DIR);
  const names = new Set<string>();
  for (const dir of [projectDir, globalDir]) {
    let entries: string[] = [];
    try {
      entries = existsSync(dir) ? readdirSync(dir) : [];
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.endsWith(".d.ts")) continue;
      const match = /^(.+)\.(ts|js)$/.exec(entry);
      if (match) names.add(match[1]);
    }
  }
  return [...names].sort();
}

/**
 * Read a resolved flow script's source from disk.
 * @throws Error with a helpful message if the file cannot be read.
 */
export function readFlowScript(path: string): string {
  try {
    return readFileSync(path, "utf-8");
  } catch (err) {
    throw new Error(
      `AgentFlow: could not read script "${path}": ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

// ─── Import-graph walking ───────────────────────────────────────────────────

/** One edge in a flow's static import graph. */
export interface FlowImportEdge {
  /** Absolute path of the file containing the import. */
  from: string;
  /** The specifier as written (e.g. `./helper.ts`). */
  specifier: string;
  /** Absolute path of the resolved target. */
  resolved: string;
  /** Value edges execute at runtime; type edges are erased by transpilation. */
  kind: "value" | "type";
}

/**
 * The static import graph of a flow entry: every file reachable from the
 * entry through value (`import`/`require`) and type (`import type`) edges,
 * keyed by absolute path. Declaration files (`.d.ts`) are terminal — they are
 * recorded (so type-checking can treat them as the `af` declaration source)
 * but not walked further.
 */
export interface FlowImportGraph {
  /** Absolute path of the entry script. */
  entry: string;
  /** Every reachable file (entry included), path → source. */
  files: Map<string, string>;
  /** Every edge traversed, in discovery order. */
  edges: FlowImportEdge[];
}

/** Extension probing order for resolving import specifiers (jiti's order). */
const RESOLVE_EXTENSIONS = [
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".mtsx",
  ".ctsx",
];

/**
 * Resolve a relative import specifier against the importing file, probing
 * extensions (and `/index` files) the way jiti's loader does. Returns the
 * resolved absolute path, or null when no file matches.
 */
function resolveRelativeImport(
  specifier: string,
  fromPath: string,
): string | null {
  const base = resolve(dirname(fromPath), specifier);
  const candidates = [
    base,
    ...RESOLVE_EXTENSIONS.map((ext) => base + ext),
    ...RESOLVE_EXTENSIONS.map((ext) => join(base, `index${ext}`)),
  ];
  for (const candidate of candidates) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // Nonexistent (or unreadable) candidate — keep probing.
    }
  }
  return null;
}

/**
 * Blank out comments, string/template-literal text, and regex-literal bodies
 * with spaces while preserving offsets exactly (newlines are kept, so
 * positions in the mask map 1:1 to the input). This gives scans a
 * "code-only" view: tokens inside comments and literals can never match.
 *
 * When `blankStrings` is false, string and template text is KEPT (only
 * comments and regex bodies are blanked) so quoted specifiers remain
 * findable; both modes tokenize identically, so positions agree.
 *
 * This is a heuristic (it does not fully model JS lexing — regex-vs-division
 * uses a prev-token check, nested template interpolations use a brace
 * counter), which is acceptable: it feeds coarse "is this token real code"
 * checks, with the runtime itself as the final authority.
 */
function maskCode(code: string, blankStrings: boolean): string {
  const chars = code.split("");
  const blank = (start: number, end: number) => {
    for (let k = start; k < end && k < code.length; k++) {
      if (chars[k] !== "\n" && chars[k] !== "\r") chars[k] = " ";
    }
  };

  // Last significant code characters (never literal text), for regex/division.
  let tail = "";
  const pushTail = (c: string) => {
    tail = (tail + c).slice(-16);
  };
  // A `/` starts a regex literal unless it can follow an expression (division).
  const regexCanFollow = (): boolean => {
    if (tail.length === 0) return true;
    const last = tail[tail.length - 1];
    if (/[)\]}'"`0-9A-Za-z$_]/.test(last)) {
      return /(?:^|[^A-Za-z0-9$_])(?:return|typeof|instanceof|in|of|new|delete|void|throw|case|do|else|yield|await)$/.test(
        tail,
      );
    }
    return true;
  };

  const n = code.length;
  let i = 0;
  // Open template-literal interpolations (`` `text ${expr} text` ``): a stack
  // of brace depths, so nested `{}` inside `${}` and nested templates work.
  const interpolations: number[] = [];

  const scanString = (quote: string): number => {
    // Returns the index just past the closing quote.
    let j = i + 1;
    while (j < n) {
      const c = code[j];
      if (c === "\\") {
        j += 2;
        continue;
      }
      if (c === quote) return j + 1;
      if (quote !== "`" && c === "\n") return j; // unterminated: bail
      j++;
    }
    return n;
  };

  // Scan template-literal text from just after an opening backtick or a
  // closing `}` of an interpolation. Blanks the text (blankStrings mode),
  // handles escapes, and stops at the closing backtick or a `${` interpolation
  // (which re-enters code scanning).
  const scanTemplateText = (): void => {
    while (i < n) {
      const t = code[i];
      if (t === "\\") {
        if (blankStrings) blank(i, Math.min(i + 2, n));
        i += 2;
        continue;
      }
      if (t === "`") {
        i++;
        return;
      }
      if (t === "$" && code[i + 1] === "{") {
        interpolations.push(1);
        i += 2;
        return;
      }
      if (blankStrings && t !== "\n" && t !== "\r") chars[i] = " ";
      i++;
    }
  };

  while (i < n) {
    const c = code[i];
    const next = i + 1 < n ? code[i + 1] : "";

    if (c === "/" && next === "/") {
      const end = code.indexOf("\n", i);
      const stop = end === -1 ? n : end;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (c === "/" && next === "*") {
      let end = code.indexOf("*/", i + 2);
      end = end === -1 ? n : end + 2;
      blank(i, end);
      i = end;
      continue;
    }
    if (c === '"' || c === "'") {
      const end = scanString(c);
      if (blankStrings) blank(i, end);
      pushTail(c);
      i = end;
      continue;
    }
    if (c === "`") {
      i++;
      scanTemplateText();
      pushTail("`");
      continue;
    }
    if (interpolations.length > 0 && (c === "{" || c === "}")) {
      if (c === "{") {
        interpolations[interpolations.length - 1]++;
        pushTail(c);
        i++;
      } else {
        interpolations[interpolations.length - 1]--;
        if (interpolations[interpolations.length - 1] === 0) {
          interpolations.pop();
          i++;
          scanTemplateText(); // back inside the template's text
          pushTail("`");
        } else {
          pushTail(c);
          i++;
        }
      }
      continue;
    }
    if (c === "/" && regexCanFollow()) {
      // Regex literal: blank the whole thing (its body is never code).
      let j = i + 1;
      let inClass = false;
      while (j < n) {
        const r = code[j];
        if (r === "\\") {
          j += 2;
          continue;
        }
        if (r === "\n") break; // not a regex after all — bail at the newline
        if (inClass) {
          if (r === "]") inClass = false;
          j++;
          continue;
        }
        if (r === "[") {
          inClass = true;
          j++;
          continue;
        }
        if (r === "/") {
          j++;
          while (j < n && /[a-z]/i.test(code[j])) j++; // flags
          break;
        }
        j++;
      }
      blank(i, j);
      pushTail("/");
      i = j;
      continue;
    }
    if (!/\s/.test(c)) pushTail(c);
    i++;
  }
  return chars.join("");
}

/** 1-based line/column of a byte offset in `source`. */
function offsetToLineCol(
  source: string,
  index: number,
): { line: number; col: number } {
  let line = 1;
  let col = 1;
  for (let k = 0; k < index && k < source.length; k++) {
    if (source[k] === "\n") {
      line++;
      col = 1;
    } else {
      col++;
    }
  }
  return { line, col };
}

/**
 * Locate the first quoted occurrence of an import specifier in a file's
 * source, for error reporting. Falls back to `0:0` when not found.
 */
function locateSpecifier(
  source: string,
  specifier: string,
): { line: number; col: number } {
  const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(['"])${escaped}\\1`).exec(source);
  if (!match) return { line: 0, col: 0 };
  return offsetToLineCol(source, match.index);
}

/**
 * Extract the runtime (value) edges from jiti's transpiled output. ESM
 * imports and `export ... from` become plain `require("specifier")` calls;
 * type-only constructs are erased by the transform, so what remains is
 * exactly the set the loader will follow at runtime.
 *
 * A `require(` is counted only when it is real code: the call must appear in
 * BOTH the comment-only mask (where its quoted argument is readable) and the
 * full mask (where strings are blanked, so mentions inside string/template
 * text or comments are dropped). A call whose argument is not a string
 * literal cannot be statically resolved and is reported as `null`.
 */
function extractRequireSpecifiers(output: string): (string | null)[] {
  const codeMask = maskCode(output, false);
  const fullMask = maskCode(output, true);
  const specifiers: (string | null)[] = [];
  for (const match of codeMask.matchAll(/(?<![\w.$])require\s*\(/g)) {
    const index = match.index ?? 0;
    // Real code only: the full mask must still spell `require` here.
    if (fullMask.slice(index, index + 7) !== "require") continue;
    let i = index + match[0].length;
    while (i < codeMask.length && /\s/.test(codeMask[i])) i++;
    const quote = codeMask[i];
    if (quote !== '"' && quote !== "'") {
      specifiers.push(null);
      continue;
    }
    let j = i + 1;
    let specifier = "";
    while (j < codeMask.length && codeMask[j] !== quote) {
      if (codeMask[j] === "\\") {
        specifier += codeMask.slice(j, Math.min(j + 2, codeMask.length));
        j += 2;
        continue;
      }
      specifier += codeMask[j];
      j++;
    }
    specifiers.push(specifier);
  }
  return specifiers;
}

/** `import type ... from "spec"` — erased by the transform, found in source. */
const TYPE_IMPORT_RE = /\bimport\s+type\s+[^;'"()]*?from\s*(['"])([^'"]+)\1/g;
/** `export type { ... } from "spec"` — likewise type-only. */
const TYPE_EXPORT_RE = /\bexport\s+type\s*\{[^}]*\}\s*from\s*(['"])([^'"]+)\1/g;

/**
 * Throw a located import-policy error. The `(line:col)` component is what
 * `validate.ts` parses back out of the message.
 */
function importError(
  file: string,
  detail: string,
  loc: { line: number; col: number },
): Error {
  const at = loc.line > 0 ? ` (${loc.line}:${loc.col})` : "";
  return new Error(`AgentFlow: import error in "${file}"${at}: ${detail}`);
}

/**
 * Transform one file's source through jiti (TypeScript when the filename says
 * so), surfacing jiti's embedded parse-error marker as a thrown Error. Used
 * for both single-file syntax validation and the import-graph walk, so every
 * graph file parses cleanly before execution.
 */
function transformFlowSource(
  jiti: ReturnType<typeof createJiti>,
  source: string,
  filename: string,
): string {
  // `.ts`/`.tsx` flows must be transpiled as TypeScript; jiti only enables
  // its TS plugin when told to, otherwise TS-only syntax (`interface`, `type`,
  // generics) is a plain-JS parse error.
  const isTs = /\.[cm]?tsx?$/.test(filename);
  const output = jiti.transform({
    source,
    filename,
    ts: isTs,
    jsx: /\.(?:tsx|jsx)$/.test(filename),
  });
  // jiti does not throw on a parse failure — it signs the failure by emitting
  // an `exports.__JITI_ERROR__ = {...}` assignment into the returned source.
  // Surface that here so a bad flow aborts during validation with a clear
  // message, instead of blowing up at runtime as a confusing
  // "exports is not defined".
  const marker = /__JITI_ERROR__\s*=\s*(\{.*\})/s.exec(output);
  if (marker) {
    let detail = marker[1];
    let at = "";
    try {
      const payload = JSON.parse(marker[1]);
      detail = payload.message ?? marker[1];
      if (payload.line !== undefined && payload.column !== undefined) {
        at = ` at ${payload.line}:${payload.column}`;
      }
    } catch {
      // Keep the raw payload if it can't be parsed.
    }
    throw new Error(`${detail}${at}`);
  }
  return output;
}

/**
 * Walk a flow entry's static import graph: transform every reachable file
 * (syntax errors surface with their location), extract its value edges (from
 * the transpiled output) and type edges (from the source), and enforce the
 * import policy on each edge.
 *
 * Policy (violations throw a located error):
 * - every specifier must start with `./` or `../` (no bare/npm names, no
 *   `node:` builtins, no absolute paths);
 * - every target must resolve to an existing file;
 * - `.d.ts` targets may be imported for types only (a value import of a
 *   declaration file is rejected);
 * - dynamic `import()` expressions are rejected outright (they cannot be
 *   walked statically);
 * - `require()` with a non-literal argument is rejected (unverifiable).
 *
 * Relative imports may escape the flow directory — there is no confinement.
 */
export function buildImportGraph(entryPath: string): FlowImportGraph {
  const jiti = createJiti(import.meta.url, {
    fsCache: false,
    moduleCache: false,
  });
  const files = new Map<string, string>();
  const edges: FlowImportEdge[] = [];

  const visit = (path: string): void => {
    if (files.has(path)) return;
    const source = readFlowScript(path);
    files.set(path, source);
    // Declaration files are terminal: types only, no runtime edges of their
    // own (the shipped `agentflow.d.ts` imports `typebox`, which is fine
    // there but must never enter a flow's graph).
    if (path.endsWith(".d.ts")) return;

    // Dynamic `import()` cannot be walked — reject before anything runs.
    // Type-position `import("./x").T` (annotations, type arguments, `as`/
    // `satisfies`/`extends` operands) is NOT a dynamic import: it is erased
    // by transpilation, so it is exempt via a lookbehind on the preceding
    // mask text. The check is a heuristic — `cond ? a : import("./x")`
    // would slip past it, which only skips this pre-flight check (the
    // runtime still resolves it).
    const fullMask = maskCode(source, true);
    for (const match of fullMask.matchAll(/(?<![\w.$])import\s*\(/g)) {
      const idx = match.index ?? 0;
      const before = fullMask.slice(Math.max(0, idx - 32), idx);
      if (
        /(?:(?:^|[^\w$.])(?:as|satisfies|extends|keyof|typeof|readonly|infer)|[:<])\s*$/.test(
          before,
        )
      ) {
        continue;
      }
      throw importError(
        path,
        "dynamic import() is not allowed in flow scripts — use a static relative import",
        offsetToLineCol(source, idx),
      );
    }

    // Value edges: transform (catches syntax errors with locations), then
    // read the surviving `require("...")` calls out of the output.
    let output: string;
    try {
      output = transformFlowSource(jiti, source, path);
    } catch (err) {
      throw new Error(
        `AgentFlow: syntax error in "${path}": ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    for (const specifier of extractRequireSpecifiers(output)) {
      if (specifier === null) {
        throw importError(
          path,
          "require() with a non-literal argument cannot be statically verified — use a literal relative specifier",
          { line: 0, col: 0 },
        );
      }
      const loc = locateSpecifier(source, specifier);
      if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
        throw importError(
          path,
          `bare specifier "${specifier}" is not allowed — flow imports must be relative ("./module" or "../module")`,
          loc,
        );
      }
      const resolved = resolveRelativeImport(specifier, path);
      if (resolved === null) {
        throw importError(
          path,
          `cannot resolve import "${specifier}" — no such file`,
          loc,
        );
      }
      if (resolved.endsWith(".d.ts")) {
        throw importError(
          path,
          `declaration files can only be imported for types — use \`import type\` for "${specifier}"`,
          loc,
        );
      }
      edges.push({ from: path, specifier, resolved, kind: "value" });
      visit(resolved);
    }

    // Type edges: erased by the transform, so scan the source (comments
    // masked so prose examples cannot trip it).
    const sourceMask = maskCode(source, false);
    const typeSpecifiers = new Set<string>();
    for (const match of sourceMask.matchAll(TYPE_IMPORT_RE)) {
      typeSpecifiers.add(match[2]);
    }
    for (const match of sourceMask.matchAll(TYPE_EXPORT_RE)) {
      typeSpecifiers.add(match[2]);
    }
    for (const specifier of typeSpecifiers) {
      const loc = locateSpecifier(source, specifier);
      if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
        throw importError(
          path,
          `bare specifier "${specifier}" is not allowed — flow imports must be relative ("./module" or "../module")`,
          loc,
        );
      }
      const resolved = resolveRelativeImport(specifier, path);
      if (resolved === null) {
        throw importError(
          path,
          `cannot resolve import "${specifier}" — no such file`,
          loc,
        );
      }
      edges.push({ from: path, specifier, resolved, kind: "type" });
      visit(resolved);
    }
  };

  visit(entryPath);
  return { entry: entryPath, files, edges };
}

/**
 * Type-check a `.ts` flow script against the `af` declarations, reporting
 * diagnostics for every file in the script's import graph. Best-effort: when
 * the TypeScript compiler is not resolvable, validation is skipped (syntax
 * validation still applies). When it is available, diagnostics are enforced
 * before execution.
 *
 * The shipped `agentflow.d.ts` is injected as a program root only when the
 * import graph does not already contain an `agentflow.d.ts`: a script that
 * imports its local copy gets `af` typed from that single source, so the
 * global is declared exactly once.
 *
 * @throws Error listing the first type errors found.
 */
export async function typeCheckFlowScript(
  path: string,
  source: string,
  declarationsPath: string,
  graph?: FlowImportGraph,
): Promise<void> {
  let ts: typeof import("typescript");
  try {
    ts = await import("typescript");
  } catch {
    // TypeScript not resolvable at runtime → fall back to syntax validation only.
    return;
  }

  const fileName = path;
  // Flow scripts use top-level `await` (loaded as async modules). `force`
  // treats every file as a module so top-level await type-checks without
  // requiring import/export syntax in the script. `allowImportingTsExtensions`
  // lets scripts import relative files with explicit `.ts` extensions.
  // `allowJs` lets `.ts` entries import `.js` helpers — the walker resolves
  // and jiti executes them, so tsc must not reject the import with TS7016
  // ("Could not find a declaration file"). `checkJs` stays off: `.js` graph
  // files are parsed for inference only, never diagnosed.
  const compilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowImportingTsExtensions: true,
    allowJs: true,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    moduleDetection: ts.ModuleDetectionKind.Force,
  };
  const host = ts.createCompilerHost(compilerOptions);
  // Overlay the script, its graph files, and (conditionally) the declarations
  // so tsc sees exactly these files.
  const fileMap = new Map<string, string>([
    [fileName, source],
    ...(graph ? [...graph.files] : []),
  ]);
  const graphHasDeclarations = graph
    ? [...graph.files.keys()].some((f) => basename(f) === "agentflow.d.ts")
    : false;
  const roots = [fileName];
  // Ambient `require`: `.ts` flows may use CommonJS `require("./x")` (the
  // import policy allows it and the runtime executes it), so tsc needs a
  // global declaration or it rejects the flow with "Cannot find name
  // 'require'". It must be appended as a second `declare global` block — the
  // declaration sources are modules (they import/export), so a top-level
  // `declare function` there would be module-scoped, not global; separate
  // `declare global` blocks merge. The result is `any`, keeping property
  // access on the required module permissive.
  const AMBIENT_REQUIRE =
    "\ndeclare global {\n  function require(id: string): any;\n}\n";
  if (graphHasDeclarations) {
    for (const [f, content] of fileMap) {
      if (basename(f) === "agentflow.d.ts") {
        fileMap.set(f, content + AMBIENT_REQUIRE);
      }
    }
  } else {
    fileMap.set(
      declarationsPath,
      readFileSync(declarationsPath, "utf-8") + AMBIENT_REQUIRE,
    );
    roots.push(declarationsPath);
  }
  const origGetSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (
    name,
    langVersion,
    onError,
    shouldCreateNewSourceFile,
  ) => {
    const content = fileMap.get(name);
    if (content !== undefined) {
      return ts.createSourceFile(name, content, langVersion, true);
    }
    return origGetSourceFile(
      name,
      langVersion,
      onError,
      shouldCreateNewSourceFile,
    );
  };
  const origFileExists = host.fileExists.bind(host);
  host.fileExists = (name) => fileMap.has(name) || origFileExists(name);
  const origReadFile = host.readFile.bind(host);
  host.readFile = (name) => fileMap.get(name) ?? origReadFile(name);

  const program = ts.createProgram(roots, compilerOptions, host);

  // Report diagnostics for the entry and every graph file — but nothing else
  // (in particular not the injected shipped declarations). Paths are matched
  // both raw and realpath-normalized so symlinked temp dirs still line up.
  const reportable = new Set<string>(graph ? graph.files.keys() : [fileName]);
  reportable.add(fileName);
  const normalized = new Set<string>();
  for (const p of reportable) {
    try {
      normalized.add(realpathSync(p));
    } catch {
      normalized.add(p);
    }
  }
  const inGraph = (name: string): boolean => {
    if (reportable.has(name)) return true;
    try {
      return normalized.has(realpathSync(name));
    } catch {
      return false;
    }
  };

  const diagnostics = ts
    .getPreEmitDiagnostics(program)
    .filter((d) => d.file !== undefined && inGraph(d.file.fileName));
  if (diagnostics.length > 0) {
    const messages = diagnostics
      .map((d) => {
        const pos =
          d.start !== undefined
            ? d.file?.getLineAndCharacterOfPosition(d.start)
            : undefined;
        const loc = pos ? `${pos.line + 1}:${pos.character + 1}` : "?";
        // Non-entry diagnostics carry their file so the report can say where
        // the error lives; the entry keeps the old `line:col` shape.
        const prefix =
          d.file && d.file.fileName !== fileName
            ? `${d.file.fileName}:${loc}`
            : loc;
        return `  ${prefix}\t${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`;
      })
      .join("\n");
    throw new Error(`AgentFlow: type errors in "${path}":\n${messages}`);
  }
}
