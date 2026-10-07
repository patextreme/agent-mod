import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatUsage, parseUsage } from "./parse.js";

const FULL_BODY = JSON.stringify({
  included: {
    session: {
      remaining_percent: 97.5,
      resets_at: "2026-10-07T08:00:00Z",
    },
    weekly: {
      remaining_percent: 99.5,
      resets_at: "2026-10-12T00:00:00Z",
    },
  },
  purchased: { balance_usd: 0 },
});

describe("parseUsage", () => {
  it("converts remaining percentages into consumed fractions", () => {
    assert.deepStrictEqual(parseUsage(FULL_BODY), {
      session: 0.025,
      weekly: 0.005,
    });
  });

  it("ignores unrelated fields (resets_at, purchased balance)", () => {
    assert.deepStrictEqual(parseUsage(FULL_BODY), {
      session: 0.025,
      weekly: 0.005,
    });
  });

  it("accepts zero consumption (nothing used, fully remaining)", () => {
    assert.deepStrictEqual(
      parseUsage(
        '{"included":{"session":{"remaining_percent":100},"weekly":{"remaining_percent":100}}}',
      ),
      { session: 0, weekly: 0 },
    );
  });

  it("accepts full consumption (nothing remaining)", () => {
    assert.deepStrictEqual(
      parseUsage(
        '{"included":{"session":{"remaining_percent":0},"weekly":{"remaining_percent":0}}}',
      ),
      { session: 1, weekly: 1 },
    );
  });

  it("clamps a remaining percentage above 100 to zero consumption", () => {
    assert.deepStrictEqual(
      parseUsage('{"included":{"session":{"remaining_percent":120}}}'),
      { session: 0, weekly: null },
    );
  });

  it("clamps a negative remaining percentage to full consumption", () => {
    assert.deepStrictEqual(
      parseUsage('{"included":{"session":{"remaining_percent":-20}}}'),
      { session: 1, weekly: null },
    );
  });

  it("returns null per window when a window is missing", () => {
    assert.deepStrictEqual(
      parseUsage('{"included":{"session":{"remaining_percent":50}}}'),
      { session: 0.5, weekly: null },
    );
  });

  it("returns null per window when remaining_percent is missing", () => {
    assert.deepStrictEqual(
      parseUsage(
        '{"included":{"session":{},"weekly":{"remaining_percent":90}}}',
      ),
      { session: null, weekly: 0.1 },
    );
  });

  it("returns null when remaining_percent is a string", () => {
    assert.deepStrictEqual(
      parseUsage(
        '{"included":{"session":{"remaining_percent":"0.5"},"weekly":{"remaining_percent":90}}}',
      ),
      { session: null, weekly: 0.1 },
    );
  });

  it("returns null when remaining_percent is an object", () => {
    assert.deepStrictEqual(
      parseUsage(
        '{"included":{"session":{"remaining_percent":{}},"weekly":{"remaining_percent":90}}}',
      ),
      { session: null, weekly: 0.1 },
    );
  });

  it("returns null when remaining_percent is non-finite (1e999 overflows to Infinity)", () => {
    assert.deepStrictEqual(
      parseUsage(
        '{"included":{"session":{"remaining_percent":1e999},"weekly":{"remaining_percent":90}}}',
      ),
      { session: null, weekly: 0.1 },
    );
  });

  it("returns null when remaining_percent is null", () => {
    assert.deepStrictEqual(
      parseUsage(
        '{"included":{"session":{"remaining_percent":null},"weekly":{"remaining_percent":90}}}',
      ),
      { session: null, weekly: 0.1 },
    );
  });

  it("returns both null when included is missing", () => {
    assert.deepStrictEqual(parseUsage('{"purchased": {"balance_usd": 0}}'), {
      session: null,
      weekly: null,
    });
  });

  it("returns both null when included is not an object", () => {
    assert.deepStrictEqual(parseUsage('{"included": []}'), {
      session: null,
      weekly: null,
    });
  });

  it("returns both null when included is null", () => {
    assert.deepStrictEqual(parseUsage('{"included": null}'), {
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
