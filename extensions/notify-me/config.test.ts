import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadConfiguration } from "./config.js";

// Synthetic credentials only. No test contacts Discord or reads personal config.
const token = "synthetic-private-token_123";
const webhookUrl = `https://discord.com/api/webhooks/123456789/${token}`;

async function fixture() {
  const homeDir = await mkdtemp(join(tmpdir(), "notify-me-config-"));
  const configDir = join(homeDir, ".pi");
  await mkdir(configDir);
  return {
    homeDir,
    configDir,
    configPath: join(configDir, "notify-me.json"),
    keyPath: join(configDir, "discord-webhook-url"),
    cleanup: () => rm(homeDir, { recursive: true, force: true }),
  };
}

function assertSafeFailure(
  result: Awaited<ReturnType<typeof loadConfiguration>>,
  guidance: RegExp,
) {
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("Expected controlled failure");
  assert.match(result.diagnostic, guidance);
  assert.ok(!JSON.stringify(result).includes(token));
  assert.ok(!JSON.stringify(result).includes(webhookUrl));
  assert.deepEqual(Object.keys(result).sort(), ["diagnostic", "ok"]);
}

for (const pathKind of ["absolute", "relative", "tilde"] as const) {
  test(`loads ${pathKind} credential path, trimmed path and UTF-8 content`, async (t) => {
    const f = await fixture();
    t.after(f.cleanup);
    const keyPath =
      pathKind === "tilde"
        ? join(f.homeDir, ".config", "pi", "discord-webhook-url")
        : f.keyPath;
    if (pathKind === "tilde") {
      await mkdir(join(f.homeDir, ".config", "pi"), { recursive: true });
    }
    const keyFile =
      pathKind === "absolute"
        ? keyPath
        : pathKind === "relative"
          ? "discord-webhook-url"
          : "~/.config/pi/discord-webhook-url";
    await writeFile(f.configPath, JSON.stringify({ keyFile: ` ${keyFile} ` }));
    await writeFile(keyPath, `\uFEFF \n\t${webhookUrl}\r\n`, { mode: 0o600 });
    const result = await loadConfiguration({ homeDir: f.homeDir });
    assert.deepEqual(result, { ok: true, webhookUrl });
  });
}

test("relative paths resolve against ~/.pi, not cwd; nested and parent paths work", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  await mkdir(join(f.homeDir, "private"));
  await writeFile(join(f.homeDir, "private", "url"), webhookUrl);
  await writeFile(f.configPath, JSON.stringify({ keyFile: "../private/url" }));
  assert.deepEqual(await loadConfiguration({ homeDir: f.homeDir }), {
    ok: true,
    webhookUrl,
  });
});

test("missing configuration gives safe setup guidance", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  assertSafeFailure(
    await loadConfiguration({ homeDir: f.homeDir }),
    /Cannot read ~\/\.pi\/notify-me\.json.*keyFile/,
  );
});

test("malformed JSON never echoes parse input", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  await writeFile(f.configPath, `{ "keyFile": "${webhookUrl}`);
  assertSafeFailure(
    await loadConfiguration({ homeDir: f.homeDir }),
    /Invalid JSON.*keyFile/,
  );
});

for (const config of [
  null,
  [],
  5,
  "value",
  {},
  { keyFile: 5 },
  { keyFile: "" },
  { keyFile: " \n\t" },
]) {
  test(`rejects invalid config schema ${JSON.stringify(config)}`, async (t) => {
    const f = await fixture();
    t.after(f.cleanup);
    await writeFile(f.configPath, JSON.stringify(config));
    assertSafeFailure(
      await loadConfiguration({ homeDir: f.homeDir }),
      /keyFile.*nonempty string/,
    );
  });
}

test("missing credential file never echoes a sensitive keyFile value", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  await writeFile(f.configPath, JSON.stringify({ keyFile: token }));
  assertSafeFailure(
    await loadConfiguration({ homeDir: f.homeDir }),
    /credential file.*exists and is readable/,
  );
});

for (const unreadable of ["config", "credential"] as const) {
  test(`unreadable ${unreadable} file uses controlled diagnostics, not exception details`, async (t) => {
    const f = await fixture();
    t.after(f.cleanup);
    await writeFile(f.configPath, JSON.stringify({ keyFile: f.keyPath }));
    await writeFile(f.keyPath, webhookUrl);
    // Inject EACCES at the read boundary: deterministic even for privileged Nix
    // builders, which may be able to read a real mode-000 file.
    const deniedPath = unreadable === "config" ? f.configPath : f.keyPath;
    const readText = async (path: string) => {
      if (path === deniedPath) {
        throw Object.assign(new Error(`EACCES: ${webhookUrl}`), {
          code: "EACCES",
          path: webhookUrl,
        });
      }
      return readFile(path, "utf8");
    };
    assertSafeFailure(
      await loadConfiguration({ homeDir: f.homeDir, readText }),
      unreadable === "config"
        ? /Create a readable JSON file/
        : /exists and is readable/,
    );
  });
}

for (const directory of ["config", "credential"] as const) {
  test(`a directory instead of the ${directory} file fails safely`, async (t) => {
    const f = await fixture();
    t.after(f.cleanup);
    if (directory === "config") {
      await mkdir(f.configPath);
    } else {
      await writeFile(f.configPath, JSON.stringify({ keyFile: f.keyPath }));
      await mkdir(f.keyPath);
    }
    assertSafeFailure(
      await loadConfiguration({ homeDir: f.homeDir }),
      /Cannot read/,
    );
  });
}

test("empty credential file gives actionable guidance", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  await writeFile(f.configPath, JSON.stringify({ keyFile: f.keyPath }));
  await writeFile(f.keyPath, " \n\t");
  assertSafeFailure(
    await loadConfiguration({ homeDir: f.homeDir }),
    /empty.*complete Discord HTTPS webhook URL/,
  );
});

for (const validUrl of [
  webhookUrl,
  webhookUrl.replace("discord.com", "discordapp.com"),
  webhookUrl.replace("/api/", "/api/v10/"),
  webhookUrl.replace("discord.com", "discord.com:443"),
  webhookUrl.replace("https://discord.com", "HTTPS://DISCORD.COM"),
]) {
  test(`accepts recognized Discord endpoint ${validUrl}`, async (t) => {
    const f = await fixture();
    t.after(f.cleanup);
    await writeFile(f.configPath, JSON.stringify({ keyFile: f.keyPath }));
    await writeFile(f.keyPath, validUrl);
    assert.deepEqual(await loadConfiguration({ homeDir: f.homeDir }), {
      ok: true,
      webhookUrl: validUrl,
    });
  });
}

const unsafeUrls = [
  "not a URL",
  webhookUrl.replace("https:", "http:"),
  webhookUrl.replace("https:", "file:"),
  webhookUrl.replace("discord.com", "evil.example"),
  webhookUrl.replace("discord.com", "discord.com.evil.example"),
  webhookUrl.replace("discord.com", "canary.discord.com"),
  webhookUrl.replace("discord.com", "discord.com."),
  webhookUrl.replace("discord.com", "127.0.0.1"),
  webhookUrl.replace("discord.com", "user:password@discord.com"),
  webhookUrl.replace("discord.com", "@discord.com"),
  webhookUrl.replace("discord.com", "discord.com@evil.example"),
  webhookUrl.replace("discord.com", "discord.com:8443"),
  webhookUrl.replace("discord.com", "discord.com:"),
  webhookUrl.replace("123456789", "not-an-id"),
  webhookUrl.replace("/webhooks/", "/channels/"),
  webhookUrl.replace(token, ""),
  webhookUrl.replace(token, "%2Fsecret"),
  webhookUrl.replace(token, "secret/extra"),
  webhookUrl.replace("/api/", "/x/../api/"),
  webhookUrl.replace("/api/", "\\api/"),
  webhookUrl.replace("discord.com", "dis\ncord.com"),
  `${webhookUrl}?wait=true`,
  `${webhookUrl}?`,
  `${webhookUrl}#fragment`,
  `${webhookUrl}#`,
];

for (const [index, unsafeUrl] of unsafeUrls.entries()) {
  test(`rejects unsafe or malformed endpoint #${index + 1} without leakage`, async (t) => {
    const f = await fixture();
    t.after(f.cleanup);
    await writeFile(f.configPath, JSON.stringify({ keyFile: f.keyPath }));
    await writeFile(f.keyPath, unsafeUrl);
    assertSafeFailure(
      await loadConfiguration({ homeDir: f.homeDir }),
      /Invalid notify-me credential.*HTTPS Discord webhook URL/,
    );
  });
}

test("configuration is read afresh, while earlier successful results retain their destination", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  await writeFile(f.configPath, JSON.stringify({ keyFile: f.keyPath }));
  await writeFile(f.keyPath, webhookUrl);
  const original = await loadConfiguration({ homeDir: f.homeDir });
  await writeFile(f.keyPath, "invalid credential");
  assertSafeFailure(await loadConfiguration({ homeDir: f.homeDir }), /Invalid/);
  assert.deepEqual(original, { ok: true, webhookUrl });
});
