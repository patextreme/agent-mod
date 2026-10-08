import assert from "node:assert/strict";
import { test } from "node:test";
import {
  captureHandback,
  type DiscordPayload,
  renderPayload,
  truncate,
} from "./payload.js";

const webhookUrl = "https://discord.com/api/webhooks/123/private-token";
const pending = {
  message: "Check the result",
  webhookUrl,
  armedAt: 1000,
  session: 4,
};
function snapshot(
  status: "completed" | "error" = "completed",
  errorReason?: string,
  cwd = "/full/working/directory",
  sessionName?: string,
) {
  return captureHandback(
    pending,
    { status, errorReason },
    { cwd, sessionName },
    62_234,
  );
}
function field(payload: DiscordPayload, name: string) {
  return payload.embeds[0].fields.find((item) => item.name === name)?.value;
}
function valid(payload: DiscordPayload) {
  assert.equal(payload.embeds.length, 1);
  const embed = payload.embeds[0];
  assert.ok(embed.title.length <= 256);
  assert.ok(embed.description.length <= 4096);
  assert.ok(embed.fields.length <= 25);
  let total = embed.title.length + embed.description.length;
  for (const item of embed.fields) {
    assert.ok(item.name.length > 0 && item.name.length <= 256);
    assert.ok(item.value.length > 0 && item.value.length <= 1024);
    total += item.name.length + item.value.length;
  }
  assert.ok(total <= 6000, String(total));
  for (const value of [
    embed.description,
    ...embed.fields.map((item) => item.value),
  ]) {
    assert.doesNotMatch(
      value,
      /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/,
    );
  }
  assert.deepEqual(payload.allowed_mentions, {
    parse: [],
    users: [],
    roles: [],
    replied_user: false,
  });
}

test("completion contains only explicit message and originating handback context", () => {
  const payload = renderPayload(
    snapshot("completed", undefined, "/full/cwd", "Long task"),
  );
  const embed = payload.embeds[0];
  assert.equal(embed.title, "Agent finished");
  assert.equal(embed.description, pending.message);
  assert.equal(embed.timestamp, new Date(62_234).toISOString());
  assert.equal(field(payload, "Working directory"), "/full/cwd");
  assert.equal(field(payload, "Elapsed since arming"), "1m 1s");
  assert.equal(field(payload, "Session"), "Long task");
  assert.equal(field(payload, "Error reason"), undefined);
  assert.doesNotMatch(
    JSON.stringify(payload),
    /succeeded|private-token|webhooks/,
  );
  valid(payload);
});

test("error is distinct, concise, first-line only and has honest missing reason", () => {
  const payload = renderPayload(
    snapshot(
      "error",
      "Provider unavailable\n    at secretStack\ntranscript content",
    ),
  );
  assert.equal(payload.embeds[0].title, "Agent errored");
  assert.notEqual(
    payload.embeds[0].color,
    renderPayload(snapshot()).embeds[0].color,
  );
  assert.equal(field(payload, "Error reason"), "Provider unavailable");
  assert.equal(
    field(renderPayload(snapshot("error")), "Error reason"),
    "Reason unavailable.",
  );
  assert.equal(
    field(renderPayload(snapshot("error", "\n at stackOnly")), "Error reason"),
    "Reason unavailable.",
  );
  assert.equal(field(renderPayload(snapshot()), "Session"), undefined);
  valid(payload);
});

test("snapshot is immutable detached plain data with no transcript/response access", () => {
  const source = {
    ...pending,
    transcript: "NEVER TRANSCRIPT",
    response: "NEVER RESPONSE",
    summary: "NEVER SUMMARY",
  };
  const context = { cwd: "/original", sessionName: "Original" };
  const captured = captureHandback(
    source,
    { status: "completed" },
    context,
    2000,
  );
  source.message = "Changed";
  context.cwd = "/later";
  context.sessionName = "Later";
  assert.equal(captured.message, pending.message);
  assert.equal(captured.cwd, "/original");
  assert.equal(captured.sessionName, "Original");
  assert.ok(Object.isFrozen(captured));
  const payload = renderPayload(captured);
  assert.ok(
    Object.isFrozen(payload) &&
      Object.isFrozen(payload.embeds) &&
      Object.isFrozen(payload.embeds[0]) &&
      Object.isFrozen(payload.embeds[0].fields) &&
      payload.embeds[0].fields.every(Object.isFrozen),
  );
  assert.doesNotMatch(
    JSON.stringify({ captured, payload }),
    /NEVER|transcript|response|summary|webhookUrl|private-token/,
  );
});

test("all outbound categories redact the known URL/token and webhook links before truncating", () => {
  const secretText = `${webhookUrl} private-token https://discordapp.com/api/v10/webhooks/456/other-secret`;
  const captured = captureHandback(
    { ...pending, message: secretText },
    { status: "error", errorReason: secretText },
    { cwd: secretText, sessionName: secretText },
    2000,
  );
  assert.doesNotMatch(
    JSON.stringify(renderPayload(captured)),
    /private-token|other-secret|webhooks|discord/,
  );
  assert.match(captured.message, /\[redacted\]/);
});

for (const value of ["x", "界", "😀", "e\u0301", "👩‍💻"]) {
  test(`individual and aggregate budgets preserve categories for ${JSON.stringify(value)}`, () => {
    const long = value.repeat(7000);
    const captured = captureHandback(
      { ...pending, message: long },
      { status: "error", errorReason: long },
      { cwd: long, sessionName: long },
      3_601_000,
    );
    const payload = renderPayload(captured);
    valid(payload);
    assert.equal(payload.embeds[0].title, "Agent errored");
    for (const category of ["Working directory", "Session", "Error reason"])
      assert.ok(field(payload, category)?.endsWith("…"));
    assert.ok(payload.embeds[0].description.endsWith("…"));
    assert.equal(field(payload, "Elapsed since arming"), "1h 0m 0s");
    assert.equal(
      payload.embeds[0].timestamp,
      new Date(3_601_000).toISOString(),
    );
  });
}

for (const limit of [512, 1024, 3000]) {
  test(`exact ASCII and surrogate boundaries at budget ${limit}`, () => {
    assert.equal(truncate("a".repeat(limit), limit), "a".repeat(limit));
    assert.equal(
      truncate("a".repeat(limit + 1), limit),
      `${"a".repeat(limit - 1)}…`,
    );
    assert.equal(
      truncate(`${"a".repeat(limit - 2)}😀x`, limit),
      `${"a".repeat(limit - 2)}…`,
    );
  });
}

test("control removal cannot reconstruct a secret after redaction", () => {
  const payload = renderPayload(
    captureHandback(
      { ...pending, message: "private-\u0000token" },
      {
        status: "error",
        errorReason: "Provider unavailable\r at private-token",
      },
      { cwd: "/cwd", sessionName: "private-\u0001token" },
      2000,
    ),
  );
  assert.doesNotMatch(JSON.stringify(payload), /private-token/);
  assert.equal(field(payload, "Error reason"), "Provider unavailable");
});

test("mention syntax never enables user, role, everyone or reply mentions", () => {
  const mentions = "@everyone @here <@123> <@!456> <@&789>";
  const payload = renderPayload(
    captureHandback(
      { ...pending, message: mentions },
      { status: "error", errorReason: mentions },
      { cwd: mentions, sessionName: mentions },
      2000,
    ),
  );
  assert.equal(payload.embeds[0].description, mentions);
  valid(payload);
});

test("negative elapsed time clamps to zero; control and lone surrogate text stays valid", () => {
  const payload = renderPayload(
    captureHandback(
      { ...pending, message: "\u0000a\ud800b\udfff" },
      { status: "completed" },
      { cwd: "/cwd" },
      0,
    ),
  );
  assert.equal(payload.embeds[0].description, "a�b�");
  assert.equal(field(payload, "Elapsed since arming"), "0s");
  valid(payload);
});
