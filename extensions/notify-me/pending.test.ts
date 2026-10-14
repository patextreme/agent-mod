import assert from "node:assert/strict";
import { test } from "node:test";
import { PendingNotifications } from "./pending.js";

const webhookUrl = "https://discord.com/api/webhooks/123/fixture-token";

test("querying empty state does not invalidate an outstanding arm generation", () => {
  const pending = new PendingNotifications();
  const generation = pending.beginArm();
  assert.equal(pending.hasPending(), false);
  assert.equal(pending.hasPending(), false);
  assert.equal(pending.isCurrent(generation), true);
  assert.equal(pending.arm(generation, "first", webhookUrl, 1000), true);
  assert.equal(pending.hasPending(), true);
});

test("querying armed state neither consumes it nor invalidates replacement", () => {
  const pending = new PendingNotifications();
  const generation = pending.beginArm();
  pending.arm(generation, "original", webhookUrl, 1000);
  assert.equal(pending.hasPending(), true);
  assert.equal(pending.hasPending(), true);
  assert.equal(pending.isCurrent(generation), true);
  const notification = pending.take();
  assert.deepEqual(notification, {
    message: "original",
    webhookUrl,
    armedAt: 1000,
    session: 0,
  });
  assert.ok(Object.isFrozen(notification));
  assert.equal(pending.hasPending(), false);
  assert.equal(pending.isCurrent(generation), false);

  const next = pending.beginArm();
  pending.arm(next, "next", webhookUrl, 2000);
  const replacement = pending.beginArm();
  assert.equal(pending.hasPending(), true);
  assert.equal(pending.isCurrent(replacement), true);
  assert.equal(pending.arm(replacement, "replacement", webhookUrl, 3000), true);
  assert.deepEqual(pending.take(), {
    message: "replacement",
    webhookUrl,
    armedAt: 3000,
    session: 0,
  });
});

test("query reflects clear and session reset without changing their guards", () => {
  const pending = new PendingNotifications();
  const first = pending.beginArm();
  pending.arm(first, "first", webhookUrl, 1000);
  pending.clear();
  assert.equal(pending.hasPending(), false);
  assert.equal(pending.arm(first, "stale", webhookUrl, 2000), false);
  const second = pending.beginArm();
  pending.arm(second, "second", webhookUrl, 3000);
  pending.resetSession();
  assert.equal(pending.hasPending(), false);
  assert.equal(pending.arm(second, "old session", webhookUrl, 4000), false);
  const current = pending.beginArm();
  assert.equal(pending.hasPending(), false);
  assert.equal(pending.arm(current, "new session", webhookUrl, 5000), true);
  assert.deepEqual(pending.take(), {
    message: "new session",
    webhookUrl,
    armedAt: 5000,
    session: 1,
  });
});
