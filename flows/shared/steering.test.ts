import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { test } from "node:test";
import { setImmediate as nextTurn } from "node:timers/promises";
import { collectSteering, SteeringError } from "./steering.js";

const issues = [
  { id: "first", issue: "Ambiguous scope", recommendation: "Narrow the scope" },
  {
    id: "second",
    issue: "Missing test",
    recommendation: "Add a regression test",
  },
];

class FakeOutput extends Writable {
  isTTY = true;
  text = "";

  override _write(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ) {
    this.text += chunk.toString();
    callback();
  }
}

function streams() {
  const input = Object.assign(new PassThrough(), { isTTY: true });
  const output = new FakeOutput();
  const controller = new AbortController();
  const events = [
    "data",
    "end",
    "error",
    "close",
    "keypress",
    "resume",
    "pause",
  ];
  const initialInput = events.map((event) => input.listenerCount(event));
  const initialOutput = events.map((event) => output.listenerCount(event));
  const initialAbort = getEventListeners(controller.signal, "abort");
  return {
    input,
    output,
    controller,
    assertClean() {
      assert.deepEqual(
        events.map((event) => input.listenerCount(event)),
        initialInput,
        "input listeners must be removed",
      );
      assert.deepEqual(
        events.map((event) => output.listenerCount(event)),
        initialOutput,
        "output listeners must be removed",
      );
      assert.deepEqual(
        getEventListeners(controller.signal, "abort"),
        initialAbort,
        "cancellation listener must be removed",
      );
    },
  };
}

function isOutcome(outcome: SteeringError["outcome"], message?: RegExp) {
  return (error: unknown) => {
    assert.ok(error instanceof SteeringError);
    assert.equal(error.outcome, outcome);
    if (message) assert.match(error.message, message);
    return true;
  };
}

test("collects all explicit answers and prints every recommendation", async () => {
  const io = streams();
  const result = collectSteering(issues, io.controller.signal, io);
  assert.match(io.output.text, /Ambiguous scope/);
  assert.match(io.output.text, /Recommendation: Narrow the scope/);
  io.input.write("  Use the narrow scope  \n");
  await nextTurn();
  assert.match(io.output.text, /Recommendation: Add a regression test/);
  io.input.write("Add the test\n");
  assert.deepEqual(await result, {
    first: "Use the narrow scope",
    second: "Add the test",
  });
  io.assertClean();
});

test("repeats blank and whitespace-only answers without accepting defaults", async () => {
  const io = streams();
  const result = collectSteering([issues[0]], io.controller.signal, io);
  let settled = false;
  void result.then(() => {
    settled = true;
  });
  for (const blank of ["\n", "  \t  \n"]) {
    io.input.write(blank);
    await nextTurn();
    assert.equal(settled, false);
  }
  assert.equal(io.output.text.match(/Your steering:/g)?.length, 3);
  assert.equal(io.output.text.match(/non-blank/g)?.length, 2);
  io.input.write("Reject the recommendation\n");
  assert.deepEqual(await result, { first: "Reject the recommendation" });
  io.assertClean();
});

test("EOF rejects rather than returning a partially completed record", async () => {
  const io = streams();
  const result = collectSteering(issues, io.controller.signal, io);
  const rejected = assert.rejects(result, isOutcome("needs_human", /EOF/));
  io.input.write("First answer\n");
  await nextTurn();
  io.input.end();
  await rejected;
  io.assertClean();
});

test("an unterminated answer at EOF is not authorization", async () => {
  const io = streams();
  const result = collectSteering([issues[0]], io.controller.signal, io);
  const rejected = assert.rejects(result, isOutcome("needs_human", /EOF/));
  io.input.end("Incomplete answer");
  await rejected;
  io.assertClean();
});

test("cancellation interrupts a pending question and discards earlier answers", async () => {
  const io = streams();
  const result = collectSteering(issues, io.controller.signal, io);
  const rejected = assert.rejects(result, isOutcome("cancelled"));
  io.input.write("First answer\n");
  await nextTurn();
  io.controller.abort();
  await rejected;
  io.assertClean();
});

test("pre-aborted signals cancel without prompting or adding listeners", async () => {
  const io = streams();
  io.controller.abort();
  await assert.rejects(
    collectSteering(issues, io.controller.signal, io),
    isOutcome("cancelled"),
  );
  assert.equal(io.output.text, "");
  io.assertClean();
});

test("an injected timeout fails with an explicit reason, even after blank input", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const io = streams();
  const result = collectSteering(issues, io.controller.signal, {
    ...io,
    timeoutMs: 50,
  });
  const rejected = assert.rejects(
    result,
    isOutcome("failed", /timed out after 50 ms/),
  );
  io.input.write("\n");
  await nextTurn();
  t.mock.timers.tick(50);
  await rejected;
  io.assertClean();
});

test("the default timeout is exactly seven days", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const io = streams();
  const result = collectSteering(issues, io.controller.signal, io);
  let settled = false;
  void result.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  const rejected = assert.rejects(
    result,
    isOutcome("failed", /timed out after 604800000 ms/),
  );
  t.mock.timers.tick(604799999);
  await nextTurn();
  assert.equal(settled, false);
  t.mock.timers.tick(1);
  await rejected;
  io.assertClean();
});

for (const stream of ["input", "output"] as const) {
  test(`non-TTY ${stream} requires a human without prompting`, async () => {
    const io = streams();
    io[stream].isTTY = false;
    await assert.rejects(
      collectSteering(issues, io.controller.signal, io),
      isOutcome("needs_human", /TTY/),
    );
    assert.equal(io.output.text, "");
    io.assertClean();
  });
}

test("stream errors fail explicitly and clean up the interface", async () => {
  const io = streams();
  const result = collectSteering(issues, io.controller.signal, io);
  const rejected = assert.rejects(result, isOutcome("failed", /broken input/));
  io.input.emit("error", new Error("broken input"));
  await rejected;
  io.assertClean();
});

for (const outcome of ["complete", "EOF", "cancel", "timeout"] as const) {
  test(`clears the timeout on ${outcome}`, async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const clear = t.mock.method(globalThis, "clearTimeout");
    const io = streams();
    const result = collectSteering([issues[0]], io.controller.signal, {
      ...io,
      timeoutMs: 100,
    });
    const checked =
      outcome === "complete"
        ? result
        : assert.rejects(
            result,
            isOutcome(
              outcome === "EOF"
                ? "needs_human"
                : outcome === "cancel"
                  ? "cancelled"
                  : "failed",
            ),
          );
    switch (outcome) {
      case "complete":
        io.input.write("Explicit answer\n");
        break;
      case "EOF":
        io.input.end();
        break;
      case "cancel":
        io.controller.abort();
        break;
      case "timeout":
        t.mock.timers.tick(100);
        break;
    }
    await checked;
    assert.equal(clear.mock.callCount(), 1);
    io.assertClean();
  });
}

test("no issues returns an empty record without a prompt", async () => {
  const io = streams();
  assert.deepEqual(await collectSteering([], io.controller.signal, io), {});
  assert.equal(io.output.text, "");
  io.assertClean();
});
