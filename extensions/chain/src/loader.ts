import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { ChainDefinition, ChainStep } from "./schema.js";
import {
  chainDefinitionSchema,
  formatValidationIssues,
  ORANGE,
  RESET,
} from "./schema.js";

export type { ChainDefinition, ChainStep };

/** Priority order: higher index = higher priority */
const EXT_PRIORITY: Record<string, number> = {
  ".json": 0,
  ".yml": 1,
  ".yaml": 2,
};

const SUPPORTED_EXTS = new Set(Object.keys(EXT_PRIORITY));

function getStem(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? filename : filename.slice(0, dot);
}

function getExt(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot);
}

function parseContent(content: string, file: string): unknown {
  const ext = getExt(file);
  if (ext === ".yaml" || ext === ".yml") {
    return parseYaml(content);
  }
  return JSON.parse(content);
}

export function loadChainDefinitions(
  chainsDir: string,
  warn: (msg: string) => void,
): Record<string, ChainDefinition> {
  const format = (msg: string) => `${ORANGE}${msg}${RESET}`;
  const definitions: Record<string, ChainDefinition> = {};

  let allFiles: string[];
  try {
    allFiles = readdirSync(chainsDir).filter((f) =>
      SUPPORTED_EXTS.has(getExt(f)),
    );
  } catch {
    // .pi/chains/ doesn't exist — that's fine, no chains to load
    return definitions;
  }

  // Group files by stem, pick highest priority per stem
  const stemMap = new Map<
    string,
    { file: string; ext: string; priority: number }
  >();
  for (const file of allFiles) {
    const stem = getStem(file);
    const ext = getExt(file);
    const priority = EXT_PRIORITY[ext] ?? -1;
    const existing = stemMap.get(stem);
    if (!existing || priority > existing.priority) {
      stemMap.set(stem, { file, ext, priority });
    }
  }

  // Warn about shadowed files
  for (const file of allFiles) {
    const stem = getStem(file);
    const ext = getExt(file);
    const winner = stemMap.get(stem);
    if (winner && winner.file !== file) {
      warn(
        format(
          `[chain] Skipping ${file}: shadowed by ${winner.file} (priority: ${winner.ext} > ${ext})`,
        ),
      );
    }
  }

  // Parse and validate each winner
  for (const [stem, { file }] of stemMap) {
    const filePath = join(chainsDir, file);

    let content: string;
    try {
      content = readFileSync(filePath, "utf-8");
    } catch (err) {
      warn(
        format(
          `[chain] Skipping ${file}: failed to read file — ${err instanceof Error ? err.message : err}`,
        ),
      );
      continue;
    }

    let raw: unknown;
    try {
      raw = parseContent(content, file);
    } catch (err) {
      const kind = getExt(file) === ".json" ? "JSON" : "YAML";
      warn(
        format(
          `[chain] Skipping ${file}: failed to parse ${kind} — ${err instanceof Error ? err.message : err}`,
        ),
      );
      continue;
    }

    if (raw === null || raw === undefined) {
      warn(
        format(
          `[chain] Skipping ${file}: file is empty or does not contain a valid chain definition`,
        ),
      );
      continue;
    }

    const result = chainDefinitionSchema.safeParse(raw);
    if (!result.success) {
      const messages = formatValidationIssues(
        file,
        raw,
        result.error.issues,
        format,
      );
      for (const msg of messages) {
        warn(msg);
      }
      continue;
    }
    definitions[stem] = result.data;
  }

  return definitions;
}
