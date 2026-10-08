import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

export type ConfigurationResult =
  | { ok: true; webhookUrl: string }
  | { ok: false; diagnostic: string };

export interface ConfigurationOptions {
  homeDir?: string;
  readText?: (path: string) => Promise<string>;
}

// Never include supplied paths, parse input, or underlying exceptions in guidance:
// any of those can contain the webhook credential.
const diagnostics = {
  configRead:
    'Cannot read ~/.pi/notify-me.json. Create a readable JSON file containing { "keyFile": "path/to/private-webhook-file" }.',
  configJson:
    'Invalid JSON in ~/.pi/notify-me.json. Use an object containing { "keyFile": "path/to/private-webhook-file" }.',
  configSchema:
    'Invalid ~/.pi/notify-me.json configuration. Set "keyFile" to a nonempty string naming a private UTF-8 webhook file.',
  keyRead:
    "Cannot read the notify-me credential file. Check that keyFile exists and is readable; relative paths resolve against ~/.pi and ~/ expands to your home directory.",
  keyEmpty:
    "The notify-me credential file is empty. Save the complete Discord HTTPS webhook URL in that private UTF-8 file.",
  keyUrl:
    "Invalid notify-me credential. Use a complete HTTPS Discord webhook URL on discord.com or discordapp.com, with a webhook ID and token; no userinfo, query, fragment, or nonstandard port.",
} as const;

function isDiscordWebhook(webhookUrl: string): boolean {
  // URL parsers normalize backslashes, whitespace, and dot segments. Do not let
  // normalization turn a malformed credential into an accepted destination.
  if (!/^https:\/\//i.test(webhookUrl) || /[\s\\]/.test(webhookUrl)) {
    return false;
  }
  try {
    const url = new URL(webhookUrl);
    const pathStart = webhookUrl.indexOf("/", 8);
    const authority = webhookUrl.slice(8, pathStart);
    const rawPath = webhookUrl.slice(pathStart);
    return (
      /^(?:discord\.com|discordapp\.com)(?::443)?$/i.test(authority) &&
      url.protocol === "https:" &&
      (url.hostname === "discord.com" || url.hostname === "discordapp.com") &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === "443") &&
      !url.search &&
      !url.hash &&
      /^\/api\/(?:v[1-9]\d*\/)?webhooks\/[1-9]\d*\/[A-Za-z0-9_-]+$/.test(
        rawPath,
      )
    );
  } catch {
    return false;
  }
}

/** Read only when arming; successful callers retain this validated destination. */
export async function loadConfiguration(
  options: ConfigurationOptions = {},
): Promise<ConfigurationResult> {
  const home = options.homeDir ?? homedir();
  const configDir = join(home, ".pi");
  const readText = options.readText ?? ((path) => readFile(path, "utf8"));
  let text: string;
  try {
    text = await readText(join(configDir, "notify-me.json"));
  } catch {
    return { ok: false, diagnostic: diagnostics.configRead };
  }

  let config: unknown;
  try {
    config = JSON.parse(text);
  } catch {
    return { ok: false, diagnostic: diagnostics.configJson };
  }
  if (
    !config ||
    typeof config !== "object" ||
    Array.isArray(config) ||
    !("keyFile" in config) ||
    typeof config.keyFile !== "string" ||
    !config.keyFile.trim()
  ) {
    return { ok: false, diagnostic: diagnostics.configSchema };
  }

  const keyFile = config.keyFile.trim();
  const keyPath = keyFile.startsWith("~/")
    ? resolve(home, keyFile.slice(2))
    : isAbsolute(keyFile)
      ? keyFile
      : resolve(configDir, keyFile);
  let webhookUrl: string;
  try {
    webhookUrl = (await readText(keyPath)).trim();
  } catch {
    return { ok: false, diagnostic: diagnostics.keyRead };
  }
  if (!webhookUrl) {
    return { ok: false, diagnostic: diagnostics.keyEmpty };
  }
  if (!isDiscordWebhook(webhookUrl)) {
    return { ok: false, diagnostic: diagnostics.keyUrl };
  }
  return { ok: true, webhookUrl };
}
