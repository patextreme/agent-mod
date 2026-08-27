import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatUsage, parseUsage } from "./parse.js";

const FULL_BODY = JSON.stringify({
  activity: { cost: "0.00000", period: {}, models: [] },
  limits: {
    session: {
      usage: 0.026,
      models: [
        { name: "glm-5.3-flash", request_count: 97 },
        { name: "gpt-oss:20b", request_count: 8 },
      ],
    },
    weekly: {
      usage: 0.008,
      models: [{ name: "glm-5.3-flash", request_count: 198 }],
    },
  },
});

describe("parseUsage", () => {
  it("extracts session and weekly fractions", () => {
    assert.deepStrictEqual(parseUsage(FULL_BODY), {
      session: 0.026,
      weekly: 0.008,
    });
  });

  it("ignores unrelated fields (activity, models, request counts)", () => {
    assert.deepStrictEqual(parseUsage(FULL_BODY), {
      session: 0.026,
      weekly: 0.008,
    });
  });

  it("accepts zero usage", () => {
    assert.deepStrictEqual(
      parseUsage('{"limits":{"session":{"usage":0},"weekly":{"usage":0}}}'),
      { session: 0, weekly: 0 },
    );
  });

  it("accepts full consumption", () => {
    assert.deepStrictEqual(
      parseUsage('{"limits":{"session":{"usage":1},"weekly":{"usage":1}}}'),
      { session: 1, weekly: 1 },
    );
  });

  it("returns null per window when a window is missing", () => {
    assert.deepStrictEqual(parseUsage('{"limits":{"session":{"usage":0.5}}}'), {
      session: 0.5,
      weekly: null,
    });
  });

  it("returns null per window when usage is missing", () => {
    assert.deepStrictEqual(
      parseUsage('{"limits":{"session":{},"weekly":{"usage":0.1}}}'),
      {
        session: null,
        weekly: 0.1,
      },
    );
  });

  it("returns null when usage is a string", () => {
    assert.deepStrictEqual(
      parseUsage(
        '{"limits":{"session":{"usage":"0.5"},"weekly":{"usage":0.1}}}',
      ),
      { session: null, weekly: 0.1 },
    );
  });

  it("returns null when usage is an object", () => {
    assert.deepStrictEqual(
      parseUsage('{"limits":{"session":{"usage":{}},"weekly":{"usage":0.1}}}'),
      { session: null, weekly: 0.1 },
    );
  });

  it("returns null when usage is non-finite (1e999 overflows to Infinity)", () => {
    assert.deepStrictEqual(
      parseUsage(
        '{"limits":{"session":{"usage":1e999},"weekly":{"usage":0.1}}}',
      ),
      { session: null, weekly: 0.1 },
    );
  });

  it("returns null when usage is null", () => {
    assert.deepStrictEqual(
      parseUsage(
        '{"limits":{"session":{"usage":null},"weekly":{"usage":0.1}}}',
      ),
      { session: null, weekly: 0.1 },
    );
  });

  it("returns both null when limits is missing", () => {
    assert.deepStrictEqual(parseUsage('{"activity": {}}'), {
      session: null,
      weekly: null,
    });
  });

  it("returns both null when limits is not an object", () => {
    assert.deepStrictEqual(parseUsage('{"limits": []}'), {
      session: null,
      weekly: null,
    });
  });

  it("returns both null when limits is null", () => {
    assert.deepStrictEqual(parseUsage('{"limits": null}'), {
      session: null,
      weekly: null,
    });
  });

  it("returns both null for malformed JSON", () => {
    assert.deepStrictEqual(parseUsage("{not json"), {
      session: null,
      weekly: null,
    });
  });

  it("returns both null for an empty string", () => {
    assert.deepStrictEqual(parseUsage(""), { session: null, weekly: null });
  });

  it("returns both null when the top level is an array", () => {
    assert.deepStrictEqual(parseUsage("[1, 2, 3]"), {
      session: null,
      weekly: null,
    });
  });

  it("returns both null when the top level is a bare number", () => {
    assert.deepStrictEqual(parseUsage("12.34"), {
      session: null,
      weekly: null,
    });
  });
});

describe("formatUsage", () => {
  it("formats both fractions as percentages with one decimal", () => {
    assert.strictEqual(formatUsage(0.026, 0.008), "ollama: 2.6% / 0.8%");
  });

  it("pads short values to one decimal place", () => {
    assert.strictEqual(formatUsage(0.1, 0), "ollama: 10.0% / 0.0%");
    assert.strictEqual(formatUsage(0.005, 0.25), "ollama: 0.5% / 25.0%");
  });

  it("formats full consumption as 100.0%", () => {
    assert.strictEqual(formatUsage(1, 1), "ollama: 100.0% / 100.0%");
  });

  it("rounds to one decimal place", () => {
    assert.strictEqual(formatUsage(0.00555, 0.9961), "ollama: 0.6% / 99.6%");
  });

  it("renders ? for unknown values", () => {
    assert.strictEqual(formatUsage(null, null), "ollama: ? / ?");
    assert.strictEqual(formatUsage(0.026, null), "ollama: 2.6% / ?");
    assert.strictEqual(formatUsage(null, 0.008), "ollama: ? / 0.8%");
  });
});
