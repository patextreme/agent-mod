/**
 * discovery.ts — Flow script discovery, loading, and validation.
 *
 * A flow is resolved by name to a concrete script file, then its static
 * import graph is walked (relative-only import policy, target existence,
 * syntax of every graph file) and — for `.ts` — the script is type-checked
 * against the `af` declarations (shipped, or a local `agentflow.d.ts` copy
 * the graph already contains) before execution.
 */

import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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
/** Extensions considered as runnable flow scripts, in project/global candidate order. */
const FLOW_FILE_EXTENSIONS = [".ts", ".js"] as const;
/** Number of project-local candidates in {@link flowCandidates}, derived from the candidate array. */
const PROJECT_CANDIDATE_COUNT = FLOW_FILE_EXTENSIONS.length;

/**
 * jiti extension order used for flow imports. It matches TypeScript's
 * Bundler resolver preference (TypeScript before JavaScript) for extensionless
 * specifiers, so the file that reaches `tsc` is the file jiti executes.
 */
export const FLOW_JITI_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".mtsx",
  ".ctsx",
  ".js",
  ".mjs",
  ".cjs",
];

/** True when a path names a TypeScript declaration file. */
function isDeclarationFile(path: string): boolean {
  return path.endsWith(".d.ts");
}

/** True when a path should be transpiled as TypeScript (`.ts`/`.tsx` and c/m variants). */
function isTypeScriptPath(path: string): boolean {
  return /\.[cm]?tsx?$/.test(path);
}

/** Return the realpath for an existing file, retaining the input on lookup failure. */
function canonicalPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

/**
 * Return a path and its realpath alias (when different and resolvable). Used
 * by both the import-graph snapshot and the type-check report filter so a
 * symlinked file path matches either spelling without repeatedly calling
 * `realpathSync` per diagnostic.
 */
export function pathAliases(path: string): string[] {
  const real = canonicalPath(path);
  return real === path ? [path] : [path, real];
}

/**
 * Build the ordered candidate paths for a flow name, project-first.
 * Pure / testable: does not touch the filesystem.
 */
export function flowCandidates(
  name: string,
  projectDir: string,
  globalDir: string,
): string[] {
  const candidates = [projectDir, globalDir].flatMap((dir) =>
    FLOW_FILE_EXTENSIONS.map((ext) => join(dir, `${name}${ext}`)),
  );
  return candidates;
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
    if (isDeclarationFile(candidates[i])) continue;
    if (existsSync(candidates[i])) {
      return {
        path: candidates[i],
        isProject: i < PROJECT_CANDIDATE_COUNT,
        isTypeScript: isTypeScriptPath(candidates[i]),
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
      if (isDeclarationFile(entry)) continue;
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
  /** Every file's jiti transform from validation, reused at execution. */
  transforms?: Map<string, string>;
  /** Every edge traversed, in discovery order. */
  edges: FlowImportEdge[];
}

/** One located validation diagnostic with optionally carrying file context. */
export interface FlowDiagnostic {
  /** File the diagnostic is in, or undefined for the entry. */
  file?: string;
  /** 1-based line, or 0 when unavailable. */
  line: number;
  /** 1-based column, or 0 when unavailable. */
  col: number;
  /** Diagnostic message without leading location prefix. */
  message: string;
}

/**
 * Error thrown by discovery/type-checking that already carries structured
 * location data. `validate.ts` consumes `diagnostics` directly instead of
 * parsing `(line:col)` prefixes back out of the message string.
 */
export class FlowLocatedError extends Error {
  readonly diagnostics: FlowDiagnostic[];

  constructor(message: string, diagnostics: FlowDiagnostic[]) {
    super(message);
    this.name = "FlowLocatedError";
    this.diagnostics = diagnostics;
  }
}

/**
 * Resolve a relative import specifier with the same jiti resolver that will
 * execute the file at runtime, so validation and execution cannot disagree
 * about which file an extensionless (or `.js`-suffixed) specifier names.
 * Results are cached per importer/specifier for the walk.
 */
function resolveRelativeImport(
  jiti: ReturnType<typeof createJiti>,
  specifier: string,
  fromPath: string,
  cache: Map<string, string | null>,
): string | null {
  const key = `${fromPath}\0${specifier}`;
  if (cache.has(key)) return cache.get(key) ?? null;

  let resolvedPath: string | null = null;
  // Declaration files are imported for types only and never executed by the
  // flow loader. Resolve them directly against the importing file's directory:
  // delegating to jiti here is wrong for a missing `./agentflow.d.ts`, whose
  // only candidate is the declaration bundled next to this module (jiti's
  // base), which would resolve a non-existent local copy to the shipped file
  // instead of a missing file.
  if (specifier.endsWith(".d.ts")) {
    const candidate = resolve(dirname(fromPath), specifier);
    resolvedPath = existsSync(candidate) ? canonicalPath(candidate) : null;
  } else {
    try {
      const resolved = jiti.esmResolve(specifier, {
        parentURL: pathToFileURL(fromPath).href,
        try: true as const,
      });
      if (resolved) {
        const rawPath = resolved.startsWith("file://")
          ? fileURLToPath(resolved)
          : resolved;
        resolvedPath = canonicalPath(rawPath);
      }
    } catch {
      resolvedPath = null;
    }
  }
  cache.set(key, resolvedPath);
  return resolvedPath;
}

/**
 * Pair of masks produced by a single lexing pass over a source string:
 *
 * - `codeMask` blanks comments and regex-literal bodies while KEEPING string
 *   and template-literal text, so quoted specifiers remain findable.
 * - `fullMask` blanks strings, template text, comments, and regex bodies, so
 *   tokens inside any non-code text can never match a scan.
 *
 * Both masks preserve offsets exactly (newlines are kept, so positions map
 * 1:1 to the input), which means `codeMask`/`fullMask` can be compared at the
 * same offsets.
 *
 * This is a heuristic (it does not fully model JS lexing — regex-vs-division
 * uses a prev-token check, nested template interpolations use a brace
 * counter). It feeds coarse "is this token real code" checks; the import
 * extractors below reject any `require`/import form they cannot resolve
 * statically rather than letting the live loader be the final authority.
 */
interface MaskPair {
  codeMask: string;
  fullMask: string;
}

function maskCodePair(code: string): MaskPair {
  const codeChars = code.split("");
  const fullChars = code.split("");
  const blank = (chars: string[], start: number, end: number) => {
    for (let k = start; k < end && k < code.length; k++) {
      if (chars[k] !== "\n" && chars[k] !== "\r") chars[k] = " ";
    }
  };
  const blankBoth = (start: number, end: number) => {
    blank(codeChars, start, end);
    blank(fullChars, start, end);
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
  // closing `}` of an interpolation. Blanks the text in `fullMask` only,
  // handles escapes, and stops at the closing backtick or a `${` interpolation
  // (which re-enters code scanning).
  const scanTemplateText = (): void => {
    while (i < n) {
      const t = code[i];
      if (t === "\\") {
        blank(fullChars, i, Math.min(i + 2, n));
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
      if (t !== "\n" && t !== "\r") fullChars[i] = " ";
      i++;
    }
  };

  while (i < n) {
    const c = code[i];
    const next = i + 1 < n ? code[i + 1] : "";

    if (c === "/" && next === "/") {
      const end = code.indexOf("\n", i);
      const stop = end === -1 ? n : end;
      blankBoth(i, stop);
      i = stop;
      continue;
    }
    if (c === "/" && next === "*") {
      let end = code.indexOf("*/", i + 2);
      end = end === -1 ? n : end + 2;
      blankBoth(i, end);
      i = end;
      continue;
    }
    if (c === '"' || c === "'") {
      const end = scanString(c);
      blank(fullChars, i, end);
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
      // Regex literal: blank the whole thing (its body is never code) only
      // when it is a real, terminated literal. Bailing at a newline means the
      // slash was something else (e.g. an unterminated expression); erasing
      // through that newline used to hide real imports later on the line.
      let j = i + 1;
      let inClass = false;
      let closed = false;
      while (j < n) {
        const r = code[j];
        if (r === "\\") {
          j += 2;
          continue;
        }
        if (r === "\n") break;
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
          closed = true;
          break;
        }
        j++;
      }
      if (closed) {
        blankBoth(i, j);
        pushTail("/");
        i = j;
        continue;
      }
      pushTail("/");
      i++;
      continue;
    }
    if (!/\s/.test(c)) pushTail(c);
    i++;
  }
  return { codeMask: codeChars.join(""), fullMask: fullChars.join("") };
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
 * source, for error reporting. The code mask keeps quoted text, so the
 * specifier is findable; the full mask then confirms the associated
 * `import`/`require`/`from` token is real code rather than prose inside a
 * string or comment. Falls back to `0:0` when not found.
 */
function locateSpecifier(
  source: string,
  specifier: string,
  masks: MaskPair,
): { line: number; col: number } {
  const { codeMask, fullMask } = masks;
  const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const specRe = new RegExp(`(['"])${escaped}\\1`, "g");
  for (const match of codeMask.matchAll(specRe)) {
    const index = match.index ?? 0;
    const before = codeMask.slice(0, index);
    // The quote must belong to an actual import-like source form. Walk back
    // to the nearest `import(` / direct or wrapped `require` / `from` token
    // before the quote.
    const token = /(?:from\s*|require\s*(?:\)\s*)?\(|import\s*\(|import\s*)\s*$/.exec(
      before,
    );
    if (!token) continue;
    const tokenStart = token.index;
    const word = /[A-Za-z]+/.exec(token[0])?.[0] ?? "import";
    if (fullMask.slice(tokenStart, tokenStart + word.length) !== word) continue;
    return offsetToLineCol(source, index);
  }
  return { line: 0, col: 0 };
}

/**
 * Read a single quoted-string argument from a masked call. `afterOpenParen`
 * is the index just past the opening `(` of the call. Returns the literal
 * argument when the whole argument is one string literal and the call is
 * closed immediately after it; otherwise returns `null` so callers can treat
 * the call as unverifiable/dynamic.
 */
function readRequireStringArgument(
  mask: string,
  afterOpenParen: number,
): string | null {
  let i = afterOpenParen;
  while (i < mask.length && /\s/.test(mask[i])) i++;
  const quote = mask[i];
  if (quote !== '"' && quote !== "'") return null;
  let j = i + 1;
  let specifier = "";
  while (j < mask.length && mask[j] !== quote) {
    if (mask[j] === "\\") {
      specifier += mask.slice(j, Math.min(j + 2, mask.length));
      j += 2;
      continue;
    }
    specifier += mask[j];
    j++;
  }
  // The closing quote must be followed by the call's closing `)` (after
  // whitespace). Anything else — `require("./x" + suffix)` — is a dynamic
  // argument that cannot be statically resolved.
  let after = j + 1;
  while (after < mask.length && /\s/.test(mask[after])) after++;
  return mask[after] === ")" ? specifier : null;
}

/**
 * Extract the runtime (value) edges from jiti's transpiled output. ESM
 * imports and `export ... from` become plain `require("specifier")` calls;
 * type-only constructs are erased by the transform, so what remains is
 * exactly the set the loader will follow at runtime.
 *
 * Both direct `require(...)` calls and wrapped-`require` calls such as
 * `(0, require)("...")` are counted; both forms reach the live loader at
 * runtime. A call is counted only when it is real code: it must appear in
 * BOTH the comment-only mask (where its quoted argument is readable) and the
 * full mask (where strings are blanked, so mentions inside string/template
 * text or comments are dropped). A call whose argument is not a string
 * literal cannot be statically resolved and is reported as `null`.
 */
function extractRequireSpecifiers(
  output: string,
  masks: MaskPair = maskCodePair(output),
): (string | null)[] {
  const { codeMask, fullMask } = masks;
  const specifiers: (string | null)[] = [];
  const forms = [
    /(?<![\w.$])require\s*\(/g,
    /(?<![\w.$])require\s*\)\s*\(/g,
  ];
  for (const form of forms) {
    for (const match of codeMask.matchAll(form)) {
      const index = match.index ?? 0;
      // Real code only: the full mask must still spell `require` here.
      if (fullMask.slice(index, index + 7) !== "require") continue;
      specifiers.push(
        readRequireStringArgument(codeMask, index + match[0].length),
      );
    }
  }
  return specifiers;
}

/**
 * Find local `require` aliases (`const r = require`) written in real code.
 * Any call through one of these aliases is a runtime `require` even though
 * jiti's transform only rewrites direct `require("...")` calls.
 */
function collectRequireAliases(masks: MaskPair): Set<string> {
  const { codeMask, fullMask } = masks;
  const aliases = new Set<string>();
  const aliasDecl =
    /(?<![\w.$])(const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?<![\w.$])require(?![\w$(.])/g;
  for (const match of codeMask.matchAll(aliasDecl)) {
    const start = match.index ?? 0;
    const keyword = match[1];
    const alias = match[2];
    // Real code only: the full mask must still spell the declaration and the
    // alias in this exact spot (strings/comments are blanked there).
    if (fullMask.slice(start, start + keyword.length) !== keyword) continue;
    let cursor = keyword.length;
    while (cursor < match[0].length && /\s/.test(match[0][cursor])) cursor++;
    const aliasStart = start + cursor;
    if (match[0].slice(cursor, cursor + alias.length) !== alias) continue;
    if (fullMask.slice(aliasStart, aliasStart + alias.length) !== alias)
      continue;
    aliases.add(alias);
  }
  return aliases;
}

/**
 * Extract specifiers passed to `require` aliases found in `source`. Mirrors
 * `extractRequireSpecifiers` for the alias-call form: only calls whose alias
 * is still real code and whose argument is a single string literal produce a
 * specifier; anything dynamic produces `null` so the caller can reject it.
 */
function extractAliasedRequireSpecifiers(
  source: string,
  aliases: Set<string>,
  masks: MaskPair = maskCodePair(source),
): (string | null)[] {
  const { codeMask, fullMask } = masks;
  const specifiers: (string | null)[] = [];
  for (const alias of aliases) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const callRe = new RegExp(`(?<![\\w.$])${escaped}\\s*\\(`, "g");
    for (const match of codeMask.matchAll(callRe)) {
      const index = match.index ?? 0;
      if (fullMask.slice(index, index + alias.length) !== alias) continue;
      specifiers.push(
        readRequireStringArgument(codeMask, index + match[0].length),
      );
    }
  }
  return specifiers;
}

/** True when a `module` occurrence is a safe `module.exports` access. */
function isModuleExportsAccess(mask: string, moduleIndex: number): boolean {
  const after = mask.slice(moduleIndex + "module".length);
  return /^\s*\.\s*exports\b/.test(after);
}

/**
 * Reject any `require` identifier that is not one of the forms the walker can
 * statically resolve: a direct `require(...)` call, a wrapped
 * `(0, require)(...)` call, or the exact local alias declaration
 * `const r = require`. Without this guard, `const cp = (0, require);
 * cp("node:child_process")` would contain no direct/wrapped `require` call
 * and no collected alias, so it would otherwise validate with zero edges and
 * then run with the live loader's unrestricted `require`. Also rejects
 * non-`module.exports` `module` references (including `module.require` /
 * `module.createRequire`) and direct `eval()` calls, which can load code the
 * static walk cannot see.
 */
function assertNoUnknownRequireReferences(
  source: string,
  masks: MaskPair,
  file: string,
): void {
  const { fullMask } = masks;

  // `module.require` and `module.createRequire` are live CommonJS loaders at
  // runtime but are not scanned as value edges by {@link
  // extractRequireSpecifiers}. Reject them outright so they cannot escape the
  // relative-only policy.
  const moduleRequireRe = /(?<![\w.$])module\s*\.\s*(?:require|createRequire)\b/g;
  for (const match of fullMask.matchAll(moduleRequireRe)) {
    const index = match.index ?? 0;
    const form = match[0].replace(/\s+/g, "");
    throw importError(
      file,
      `${form} cannot be statically verified — use require("./module") directly or assign it with \`const r = require\``,
      offsetToLineCol(source, index),
    );
  }

  // Bracket access (`module["require"]`) and aliasing (`const m = module;
  // m.require(...)`) hide the same live CommonJS loaders behind syntax the
  // literal regex above does not see. Allow only `module.exports`; anything
  // else that names `module` cannot be statically proven safe.
  const moduleRefRe = /(?<![\w.$])module\b/g;
  for (const match of fullMask.matchAll(moduleRefRe)) {
    const index = match.index ?? 0;
    if (isModuleExportsAccess(fullMask, index)) continue;
    throw importError(
      file,
      "`module` is only allowed as `module.exports` — other module properties (including `module.require`) cannot be statically verified",
      offsetToLineCol(source, index),
    );
  }

  // Direct eval can reach CommonJS `require` and execute code that the static
  // walk cannot scan, such as `eval("require('node:fs')")`. Reject the call
  // rather than let the live loader be the final authority for dynamic code.
  const evalCallRe = /(?<![\w.$])eval\s*\(/g;
  for (const match of fullMask.matchAll(evalCallRe)) {
    const index = match.index ?? 0;
    throw importError(
      file,
      "eval() is not allowed in flow scripts because dynamic code cannot be statically verified",
      offsetToLineCol(source, index),
    );
  }

  const re = /(?<![\w.$])require\b/g;
  for (const match of fullMask.matchAll(re)) {
    const index = match.index ?? 0;
    const before = fullMask.slice(0, index);
    const after = fullMask.slice(index + "require".length);
    if (/^\s*\(/.test(after)) continue; // direct require(...)
    if (/^\s*\)\s*\(/.test(after)) continue; // (0, require)(...)
    const exactAliasBefore =
      /(?:^|[^\w.$])(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*$/.test(
        before,
      );
    const exactAliasTerminated =
      /^\s*(?:;|$)/.test(after) || /^\s*[\r\n]/.test(after);
    if (exactAliasBefore && exactAliasTerminated) {
      continue; // exact local alias: const r = require
    }
    throw importError(
      file,
      'require usage cannot be statically verified — use require("./module") directly or assign it with `const r = require`',
      offsetToLineCol(source, index),
    );
  }
}

/** Match static import/export-from declarations, including `type` modifiers. */
const IMPORT_OR_EXPORT_DECL_RE =
  /\b(import|export)\s*(type\s+)?([^;'"]*?)\s*from\s*(['"])([^'"]+)\4/g;

/** True when an import/export clause contains an inline `type` modifier. */
function hasInlineTypeModifier(clause: string): boolean {
  return /\btype\s+(?=[A-Za-z_$])/.test(clause);
}

/**
 * Extract specifiers from static import/export-from declarations in one pass.
 *
 * Type-only declarations (explicit `import type` / `export type`, or inline
 * `{ type X }`) are erased by jiti's transform, so they never appear as
 * runtime `require` edges; without this pass an inline
 * `import { type X } from "bare-module"` would otherwise bypass the
 * relative-only import policy entirely. Unmarked declarations are returned
 * separately because jiti may still erase them when every imported binding is
 * used only in a type position.
 *
 * Declarations are read from the code mask (where quoted specifiers are
 * readable) and cross-checked against the full mask, so lookalike import text
 * inside strings/comments is ignored the same way `extractRequireSpecifiers`
 * ignores it.
 */
function collectSourceImportSpecifiers(masks: MaskPair): {
  typeSpecifiers: Set<string>;
  unmarkedSpecifiers: Set<string>;
} {
  const { codeMask, fullMask } = masks;
  const typeSpecifiers = new Set<string>();
  const unmarkedSpecifiers = new Set<string>();

  for (const match of codeMask.matchAll(IMPORT_OR_EXPORT_DECL_RE)) {
    const start = match.index ?? 0;
    const keyword = match[1];
    // Real code only: the full mask must still spell `import`/`export` here.
    if (fullMask.slice(start, start + keyword.length) !== keyword) continue;
    const explicitType = match[2] !== undefined;
    if (explicitType || hasInlineTypeModifier(match[3])) {
      typeSpecifiers.add(match[5]);
    } else {
      unmarkedSpecifiers.add(match[5]);
    }
  }
  return { typeSpecifiers, unmarkedSpecifiers };
}

/**
 * True when a `.d.ts` file supplies the injected global `af` declaration.
 * Uses a balanced-brace scan over the full mask (so comments/strings cannot
 * hide a `}`) and then searches only inside the `declare global { ... }`
 * block, which supports nested interface/namespace braces before `const af`.
 */
function declaresGlobalAf(source: string): boolean {
  const mask = maskCodePair(source).fullMask;
  for (const match of mask.matchAll(/\bdeclare\s+global\b/g)) {
    const start = match.index ?? 0;
    const open = mask.indexOf("{", start + match[0].length);
    if (open === -1) continue;
    const close = matchingBraceEnd(mask, open);
    if (close === -1) continue;
    if (/\b(?:const|var|let)\s+af\b/.test(mask.slice(open + 1, close))) {
      return true;
    }
  }
  return false;
}

/** Return the index of `}` matching the `{` at `open`, or -1. */
function matchingBraceEnd(mask: string, open: number): number {
  let depth = 0;
  for (let i = open; i < mask.length; i++) {
    if (mask[i] === "{") {
      depth++;
    } else if (mask[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Reject CommonJS export syntax in a flow entry. Imported `.cjs`/`.js` helpers
 * legitimately use `module.exports`/`exports.*`, but in the entry those
 * assignments are never read by AgentFlow: the script would otherwise validate
 * clean and silently complete as a no-op.
 */
function assertNoEntryCommonJsExport(
  source: string,
  masks: MaskPair,
  path: string,
): void {
  const re = /(?<![\w.$])module\s*\.\s*exports\b|(?<![\w.$])exports\s*\./g;
  for (const match of masks.fullMask.matchAll(re)) {
    const index = match.index ?? 0;
    throw new FlowLocatedError(
      `AgentFlow: flow entry "${path}" uses CommonJS export syntax (${match[0].trim()}) — use ESM \`export\`, or \`af.result\` for the flow outcome`,
      [
        {
          file: path,
          line: offsetToLineCol(source, index).line,
          col: offsetToLineCol(source, index).col,
          message:
            "flow entry cannot use CommonJS export syntax (module.exports / exports.*)",
        },
      ],
    );
  }
}

/**
 * Throw a located import-policy error. The message keeps the human-readable
 * location prefix; the structured `FlowDiagnostic` carries the same data for
 * `validate.ts` without string parsing.
 */
function importError(
  file: string,
  detail: string,
  loc: { line: number; col: number },
): Error {
  const at = loc.line > 0 ? ` (${loc.line}:${loc.col})` : "";
  return new FlowLocatedError(
    `AgentFlow: import error in "${file}"${at}: ${detail}`,
    [{ file, line: loc.line, col: loc.col, message: detail }],
  );
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
  const isTs = isTypeScriptPath(filename);
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
    let line = 0;
    let col = 0;
    let detail = marker[1];
    try {
      const payload = JSON.parse(marker[1]);
      detail = payload.message ?? marker[1];
      line = payload.line ?? 0;
      col = payload.column ?? 0;
    } catch {
      // Keep the raw payload if it can't be parsed.
    }
    const at = line > 0 ? ` at ${line}:${col}` : "";
    throw new FlowLocatedError(
      `AgentFlow: syntax error in "${filename}": ${detail}${at}`,
      [
        {
          file: filename,
          line,
          col,
          message: `syntax error in "${filename}": ${detail}`,
        },
      ],
    );
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
 * - `require()` with a non-literal argument is rejected (unverifiable);
 *   calls through local `require` aliases and wrapped `(0, require)(...)`
 *   calls are treated the same, and any other free-`require` reference is
 *   rejected;
 * - any `module` reference except `module.exports` (including `module.require`,
 *   `module.createRequire`, bracket access, and `const m = module` aliases)
 *   and `eval()` calls are rejected because they can load code outside the
 *   static walk;
 * - a flow entry using CommonJS `module.exports`/`exports.*` assignment is
 *   rejected (imported helpers may still use it).
 *
 * Relative imports may resolve to any path, including outside the flow
 * directory (no directory confinement).
 */
export function buildImportGraph(entryPath: string): FlowImportGraph {
  const jiti = createJiti(import.meta.url, {
    fsCache: false,
    moduleCache: false,
    extensions: FLOW_JITI_EXTENSIONS,
  });
  const files = new Map<string, string>();
  const transforms = new Map<string, string>();
  const edges: FlowImportEdge[] = [];
  const resolveCache = new Map<string, string | null>();

  const entry = canonicalPath(entryPath);

  const visit = (path: string): void => {
    if (files.has(path)) return;
    const source = readFlowScript(path);
    files.set(path, source);
    // Declaration files are terminal: types only, no runtime edges of their
    // own (the shipped `agentflow.d.ts` imports `typebox`, which is fine
    // there but must never enter a flow's graph).
    if (isDeclarationFile(path)) return;

    const sourceMasks = maskCodePair(source);

    // Value edges first: transform (catches syntax errors with locations),
    // then read the surviving `require("...")` calls out of the output. jiti
    // lowers any real runtime `import()` expression to `jitiImport(...)`, so
    // checking the transformed output also closes the old source-heuristic
    // ternary bypass (`cond ? a : import("./x")`) while still ignoring
    // type-position `import("./x").T (which is erased).
    let output: string;
    try {
      output = transformFlowSource(jiti, source, path);
      transforms.set(path, output);
    } catch (err) {
      if (err instanceof FlowLocatedError) throw err;
      throw new Error(
        `AgentFlow: syntax error in "${path}": ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    const outputMasks = maskCodePair(output);
    assertNoRuntimeDynamicImport(outputMasks, source, sourceMasks, path);
    if (path === entry) assertNoEntryCommonJsExport(source, sourceMasks, path);
    assertNoUnknownRequireReferences(source, sourceMasks, path);

    const validateSpecifier = (
      specifier: string,
      kind: FlowImportEdge["kind"],
      declarationRule: "allow" | "reject",
    ): void => {
      // Defer location lookup until the edge actually fails; most edges are
      // valid and never need the source scan.
      const loc = (): { line: number; col: number } =>
        locateSpecifier(source, specifier, sourceMasks);

      if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
        throw importError(
          path,
          `bare specifier "${specifier}" is not allowed — flow imports must be relative ("./module" or "../module")`,
          loc(),
        );
      }
      const resolved = resolveRelativeImport(
        jiti,
        specifier,
        path,
        resolveCache,
      );
      if (resolved === null) {
        const hint = specifier.endsWith("agentflow.d.ts")
          ? ' (run "/af-init" to generate the local declarations)'
          : "";
        throw importError(
          path,
          `cannot resolve import "${specifier}" — no such file${hint}`,
          loc(),
        );
      }
      if (isDeclarationFile(resolved) && declarationRule === "reject") {
        throw importError(
          path,
          `declaration files can only be imported for types — use \`import type\` for "${specifier}"`,
          loc(),
        );
      }
      edges.push({ from: path, specifier, resolved, kind });
      visit(resolved);
    };

    const outputSpecifiers = extractRequireSpecifiers(output, outputMasks);
    const requireAliases = collectRequireAliases(sourceMasks);
    const aliasRequireSpecifiers =
      requireAliases.size > 0
        ? extractAliasedRequireSpecifiers(source, requireAliases, sourceMasks)
        : [];
    for (const specifier of [...outputSpecifiers, ...aliasRequireSpecifiers]) {
      if (specifier === null) {
        throw importError(
          path,
          "require() with a non-literal argument cannot be statically verified — use a literal relative specifier",
          { line: 0, col: 0 },
        );
      }
      validateSpecifier(specifier, "value", "reject");
    }

    // Type edges: erased by the transform, so scan the source (comments and
    // strings masked so prose examples cannot trip it). `collectTypeSpecifiers`
    // also handles inline `{ type X }` imports/exports, which would otherwise
    // be invisible to both the runtime-edge pass and the old `import type`
    // regex.
    const { typeSpecifiers, unmarkedSpecifiers } =
      collectSourceImportSpecifiers(sourceMasks);
    for (const specifier of typeSpecifiers) {
      validateSpecifier(specifier, "type", "allow");
    }

    // jiti also erases non-`type` imports/exports when every binding is used
    // only in a type position. Those are policy-relevant too: a bare or
    // `node:` specifier written this way used to disappear before validation,
    // and an unmarked `.d.ts` import could avoid the "types only" rule.
    const runtimeSpecifiers = new Set(
      [...outputSpecifiers, ...aliasRequireSpecifiers].filter(
        (s): s is string => s !== null,
      ),
    );
    for (const specifier of unmarkedSpecifiers) {
      if (runtimeSpecifiers.has(specifier) || typeSpecifiers.has(specifier)) {
        continue;
      }
      validateSpecifier(specifier, "type", "reject");
    }
  };

  visit(entry);
  return { entry, files, transforms, edges };
}

/**
 * Reject any runtime `import()` in jiti's transformed output. The transform
 * rewrites actual dynamic imports to `jitiImport(...)`; type-position
 * imports are erased in the output, so checking the output is not fooled by
 * ternary branches or `import("./x")` text inside the source. The source
 * masks are used only to pick a helpful error location.
 */
function assertNoRuntimeDynamicImport(
  outputMasks: MaskPair,
  source: string,
  sourceMasks: MaskPair,
  file: string,
): void {
  if (/(?:^|[^\w.$])jitiImport\s*\(/.test(outputMasks.fullMask)) {
    const idx = findRuntimeDynamicImport(sourceMasks.fullMask);
    const loc = idx >= 0 ? offsetToLineCol(source, idx) : { line: 0, col: 0 };
    throw importError(
      file,
      "dynamic import() is not allowed in flow scripts — use a static relative import",
      loc,
    );
  }
}

/** Find the first source `import(` that is not clearly in a type position. */
function findRuntimeDynamicImport(sourceMask: string): number {
  const re = /(?<![\w.$])import\s*\(/g;
  for (const match of sourceMask.matchAll(re)) {
    const idx = match.index ?? 0;
    const before = sourceMask.slice(Math.max(0, idx - 96), idx);
    if (!isTypePositionImport(before)) return idx;
  }
  return -1;
}

/** Best-effort type-position check used only for locating a detected import. */
function isTypePositionImport(before: string): boolean {
  if (
    /(?:^|[^\w$.])(?:as|satisfies|extends|keyof|typeof|readonly|infer)\s*$/.test(
      before,
    ) ||
    /(?:^|[^\w$])type\s+[A-Za-z_$][\w$]*(?:\s*<[^>]*>)?\s*=\s*$/.test(before) ||
    /<[^<>]*$/.test(before)
  ) {
    return true;
  }
  if (/:\s*$/.test(before)) {
    // An optional property/parameter marker (`cb?: import(...)`) is a type
    // annotation, not a ternary. A colon can also start a type annotation
    // (`const n: import(...)`) or separate a ternary's false branch
    // (`cond ? a : import(...)`); only the ternary reaches runtime.
    if (/\?:\s*$/.test(before)) return true;
    return !/\?[^:?]*:\s*$/.test(before);
  }
  return false;
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
    ? [...graph.files.entries()].some(
        ([f, content]) => isDeclarationFile(f) && declaresGlobalAf(content),
      )
    : false;
  const roots = [fileName];
  // Ambient `require`: `.ts` flows may use CommonJS `require("./x")` (the
  // import policy allows it and the runtime executes it), so tsc needs a
  // global declaration or it rejects the flow with "Cannot find name
  // 'require'". It is appended to the entry — `moduleDetection: Force` makes it
  // an external module, so a `declare global` block there is global rather
  // than module-scoped. The result is `any`, keeping property access on the
  // required module permissive.
  const AMBIENT_REQUIRE =
    "\ndeclare global {\n  function require(id: string): any;\n}\n";
  fileMap.set(fileName, `${fileMap.get(fileName) ?? source}${AMBIENT_REQUIRE}`);
  if (!graphHasDeclarations) {
    fileMap.set(declarationsPath, readFileSync(declarationsPath, "utf-8"));
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
  // (in particular not the injected shipped declarations). Entry and graph
  // paths are already canonical, so TypeScript reports matching names.
  const reportable = new Set<string>(graph ? graph.files.keys() : [fileName]);
  reportable.add(fileName);
  const inGraph = (name: string): boolean => reportable.has(name);

  const diagnostics = ts
    .getPreEmitDiagnostics(program)
    .filter((d) => d.file !== undefined && inGraph(d.file.fileName));
  if (diagnostics.length > 0) {
    const withLocation = diagnostics.map((d): FlowDiagnostic => {
      const pos =
        d.start !== undefined
          ? d.file?.getLineAndCharacterOfPosition(d.start)
          : undefined;
      const line = pos ? pos.line + 1 : 0;
      const col = pos ? pos.character + 1 : 0;
      const file =
        d.file && d.file.fileName !== fileName ? d.file.fileName : undefined;
      return {
        file,
        line,
        col,
        message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
      };
    });
    const messages = withLocation
      .map((d) => {
        const loc = d.line > 0 ? `${d.line}:${d.col}` : "?";
        const prefix = d.file !== undefined ? `${d.file}:${loc}` : loc;
        return `  ${prefix}\t${d.message}`;
      })
      .join("\n");
    throw new FlowLocatedError(
      `AgentFlow: type errors in "${path}":\n${messages}`,
      withLocation,
    );
  }
}

/**
 * Shared validation sequence for the run path and on-demand validation:
 * build the import graph, then type-check `.ts` flows against the supplied
 * declarations. Callers still choose how to surface thrown errors (UI vs.
 * structured report), but the checks themselves live in one place.
 */
export async function validateResolvedFlow(
  resolvedPath: string,
  isTypeScript: boolean,
  declarationsPath: string,
): Promise<FlowImportGraph> {
  const graph = buildImportGraph(resolvedPath);
  if (!isTypeScript) return graph;

  const entryPath = graph.entry;
  const entrySource = graph.files.get(entryPath);
  if (entrySource === undefined) {
    throw new FlowLocatedError(
      `AgentFlow: internal error — validated graph is missing "${entryPath}"`,
      [
        {
          file: entryPath,
          line: 0,
          col: 0,
          message: `internal error: validated graph is missing "${entryPath}"`,
        },
      ],
    );
  }

  await typeCheckFlowScript(entryPath, entrySource, declarationsPath, graph);
  return graph;
}
