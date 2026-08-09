/**
 * discovery.ts — Flow script discovery, loading, and validation.
 *
 * A flow is resolved by name to a concrete script file, then the script source
 * is loaded, syntax-validated, and (for `.ts`) type-checked against the shipped
 * `agentflow.d.ts` declarations before execution.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
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
 * Returns null when no `.ts`/`.js` file exists for the flow name.
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
 * `.js` file basename. Used to register per-flow `/af:<name>` shortcut commands.
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

/**
 * Syntax-validate a flow script and return the transpiled (JS) source.
 *
 * Both `.ts` and `.js` are validated and transpiled through jiti so a syntax
 * error aborts the run before any sub-agent is spawned. Throws an Error
 * describing the first syntax problem.
 */
export function validateFlowSyntax(source: string, filename: string): string {
  const jiti = createJiti(import.meta.url, {
    fsCache: false,
    moduleCache: false,
  });
  try {
    // `.ts`/`.tsx` flows must be transpiled as TypeScript; jiti only enables its
    // TS plugin when told to, otherwise TS-only syntax (`interface`, `type`,
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
      try {
        detail = JSON.parse(marker[1]).message ?? marker[1];
      } catch {
        // Keep the raw payload if it can't be parsed.
      }
      throw new Error(`AgentFlow: syntax error in "${filename}": ${detail}`);
    }
    return output;
  } catch (err) {
    throw new Error(
      `AgentFlow: syntax error in "${filename}": ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

/**
 * Type-check a `.ts` flow script against the shipped `agentflow.d.ts`
 * declarations. Best-effort: when the TypeScript compiler is not resolvable,
 * validation is skipped (syntax validation still applies). When it is
 * available, diagnostics are enforced before execution.
 *
 * @throws Error listing the first type errors found.
 */
export async function typeCheckFlowScript(
  path: string,
  source: string,
  declarationsPath: string,
): Promise<void> {
  let ts: typeof import("typescript");
  try {
    ts = await import("typescript");
  } catch {
    // TypeScript not resolvable at runtime → fall back to syntax validation only.
    return;
  }

  const fileName = path;
  // Flow scripts use top-level `await` (the runtime wraps the body in an async
  // function). `force` treats every file as a module so top-level await
  // type-checks without requiring module syntax (`import`/`export`) in the
  // script, which the runtime does not support.
  const compilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    moduleDetection: ts.ModuleDetectionKind.Force,
  };
  const host = ts.createCompilerHost(compilerOptions);
  // Overlay the script and declarations so tsc sees exactly these files.
  const fileMap = new Map<string, string>([
    [fileName, source],
    [declarationsPath, readFileSync(declarationsPath, "utf-8")],
  ]);
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

  // Include the shipped declarations as a root file so the `declare global`
  // `af` surface is visible to the script (scripts have no imports, so the
  // declarations are never pulled in transitively).
  const program = ts.createProgram(
    [fileName, declarationsPath],
    compilerOptions,
    host,
  );

  const diagnostics = ts
    .getPreEmitDiagnostics(program)
    .filter((d) => d.file?.fileName === fileName);
  if (diagnostics.length > 0) {
    const messages = diagnostics
      .map((d) => {
        const pos =
          d.start !== undefined
            ? d.file?.getLineAndCharacterOfPosition(d.start)
            : undefined;
        const loc = pos ? `${pos.line + 1}:${pos.character + 1}` : "?";
        return `  ${loc}\t${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`;
      })
      .join("\n");
    throw new Error(`AgentFlow: type errors in "${path}":\n${messages}`);
  }
}
