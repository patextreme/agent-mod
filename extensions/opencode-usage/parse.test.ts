import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatUsage, isUnknownUsage, parseUsage } from "./parse.js";

const FULL_BODY = JSON.stringify({
  usage: {
    rolling: {
      status: "ok",
      percent: 3,
      resetsAt: "2026-10-23T12:00:00Z",
    },
    weekly: {
      status: "ok",
      percent: 1,
      resetsAt: "2026-10-27T00:00:00Z",
    },
    monthly: {
      status: "ok",
      percent: 0,
      resetsAt: "2026-11-01T00:00:00Z",
    },
  },
});

describe("parseUsage", () => {
  it("extracts the consumed percentage of every meter", () => {
    assert.deepStrictEqual(parseUsage(FULL_BODY), {
      rolling: 3,
      weekly: 1,
      monthly: 0,
    });
  });

  it("ignores unrelated fields (plan metadata, fourth meter)", () => {
    const body = JSON.stringify({
      plan: "go",
      usage: {
        rolling: { status: "ok", percent: 3, resetsAt: "2026-10-23T12:00:00Z" },
        weekly: { status: "ok", percent: 1 },
        monthly: { status: "ok", percent: 0 },
        yearly: { status: "ok", percent: 99 },
      },
    });
    assert.deepStrictEqual(parseUsage(body), {
      rolling: 3,
      weekly: 1,
      monthly: 0,
    });
  });

  it("accepts zero consumption", () => {
    assert.deepStrictEqual(
      parseUsage(
        '{"usage":{"rolling":{"status":"ok","percent":0},"weekly":{"status":"ok","percent":0},"monthly":{"status":"ok","percent":0}}}',
      ),
      { rolling: 0, weekly: 0, monthly: 0 },
    );
  });

  it("accepts full consumption", () => {
    assert.deepStrictEqual(
      parseUsage(
        '{"usage":{"rolling":{"status":"ok","percent":100},"weekly":{"status":"ok","percent":100},"monthly":{"status":"ok","percent":100}}}',
      ),
      { rolling: 100, weekly: 100, monthly: 100 },
    );
  });

  it("clamps a percentage above 100 to 100", () => {
    assert.deepStrictEqual(
      parseUsage('{"usage":{"rolling":{"status":"ok","percent":140}}}'),
      { rolling: 100, weekly: null, monthly: null },
    );
  });

  it("clamps a negative percentage to 0", () => {
    assert.deepStrictEqual(
      parseUsage('{"usage":{"rolling":{"status":"ok","percent":-5}}}'),
      { rolling: 0, weekly: null, monthly: null },
    );
  });

  it("rounds a fractional percentage to one decimal place", () => {
    assert.deepStrictEqual(
      parseUsage(
        '{"usage":{"rolling":{"status":"ok","percent":3.64},"weekly":{"status":"ok","percent":0.46}}}',
      ),
      { rolling: 3.6, weekly: 0.5, monthly: null },
    );
  });

  it("returns null for a window whose status is not ok", () => {
    assert.deepStrictEqual(
      parseUsage(
        '{"usage":{"rolling":{"status":"exhausted","percent":100},"weekly":{"status":"ok","percent":1},"monthly":{"status":"ok","percent":0}}}',
      ),
      { rolling: null, weekly: 1, monthly: 0 },
    );
  });

  it("returns null for a window with a missing status", () => {
    assert.deepStrictEqual(parseUsage('{"usage":{"rolling":{"percent":3}}}'), {
      rolling: null,
      weekly: null,
      monthly: null,
    });
  });

  it("returns null per window when a window is missing", () => {
    assert.deepStrictEqual(
      parseUsage('{"usage":{"rolling":{"status":"ok","percent":3}}}'),
      { rolling: 3, weekly: null, monthly: null },
    );
  });

  it("returns null per window when percent is missing", () => {
    assert.deepStrictEqual(
      parseUsage(
        '{"usage":{"rolling":{},"weekly":{"status":"ok","percent":1}}}',
      ),
      { rolling: null, weekly: 1, monthly: null },
    );
  });

  it("returns null when percent is a string", () => {
    assert.deepStrictEqual(
      parseUsage(
        '{"usage":{"rolling":{"status":"ok","percent":"3"},"weekly":{"status":"ok","percent":1}}}',
      ),
      { rolling: null, weekly: 1, monthly: null },
    );
  });

  it("returns null when percent is an object", () => {
    assert.deepStrictEqual(
      parseUsage(
        '{"usage":{"rolling":{"status":"ok","percent":{}},"weekly":{"status":"ok","percent":1}}}',
      ),
      { rolling: null, weekly: 1, monthly: null },
    );
  });

  it("returns null when percent is non-finite (1e999 overflows to Infinity)", () => {
    assert.deepStrictEqual(
      parseUsage(
        '{"usage":{"rolling":{"status":"ok","percent":1e999},"weekly":{"status":"ok","percent":1}}}',
      ),
      { rolling: null, weekly: 1, monthly: null },
    );
  });

  it("returns null when percent is null", () => {
    assert.deepStrictEqual(
      parseUsage(
        '{"usage":{"rolling":{"status":"ok","percent":null},"weekly":{"status":"ok","percent":1}}}',
      ),
      { rolling: null, weekly: 1, monthly: null },
    );
  });

  it("returns all null when usage is missing", () => {
    assert.deepStrictEqual(parseUsage("{}"), {
      rolling: null,
      weekly: null,
      monthly: null,
    });
  });

  it("returns all null when usage is an array", () => {
    assert.deepStrictEqual(parseUsage('{"usage":[]}'), {
      rolling: null,
      weekly: null,
      monthly: null,
    });
  });

  it("returns all null when usage is null", () => {
    assert.deepStrictEqual(parseUsage('{"usage":null}'), {
      rolling: null,
      weekly: null,
      monthly: null,
    });
  });

  it("returns all null for malformed JSON", () => {
    assert.deepStrictEqual(parseUsage("{not json"), {
      rolling: null,
      weekly: null,
      monthly: null,
    });
  });

  it("returns all null for an empty string", () => {
    assert.deepStrictEqual(parseUsage(""), {
      rolling: null,
      weekly: null,
      monthly: null,
    });
  });

  it("returns all null when the top level is an array", () => {
    assert.deepStrictEqual(parseUsage("[1, 2, 3]"), {
      rolling: null,
      weekly: null,
      monthly: null,
    });
  });

  it("returns all null when the top level is a bare number", () => {
    assert.deepStrictEqual(parseUsage("12.34"), {
      rolling: null,
      weekly: null,
      monthly: null,
    });
  });
});

describe("isUnknownUsage", () => {
  it("is true only when every meter is unknown", () => {
    assert.strictEqual(
      isUnknownUsage({ rolling: null, weekly: null, monthly: null }),
      true,
    );
    assert.strictEqual(
      isUnknownUsage({ rolling: 0, weekly: null, monthly: null }),
      false,
    );
  });
});

describe("formatUsage", () => {
  it("formats all three consumed percentages", () => {
    assert.strictEqual(
      formatUsage({ rolling: 3, weekly: 1, monthly: 0 }),
      "opencode-go: 3.0% / 1.0% / 0.0%",
    );
  });

  it("keeps one decimal place for fractional values", () => {
    assert.strictEqual(
      formatUsage({ rolling: 3.6, weekly: 12.25, monthly: 0.4 }),
      "opencode-go: 3.6% / 12.3% / 0.4%",
    );
  });

  it("formats full consumption as 100.0%", () => {
    assert.strictEqual(
      formatUsage({ rolling: 100, weekly: 100, monthly: 100 }),
      "opencode-go: 100.0% / 100.0% / 100.0%",
    );
  });

  it("renders ? for unknown values", () => {
    assert.strictEqual(
      formatUsage({ rolling: null, weekly: null, monthly: null }),
      "opencode-go: ? / ? / ?",
    );
  });

  it("renders ? only for a partially unknown result", () => {
    assert.strictEqual(
      formatUsage({ rolling: 3, weekly: null, monthly: 0 }),
      "opencode-go: 3.0% / ? / 0.0%",
    );
  });
});
