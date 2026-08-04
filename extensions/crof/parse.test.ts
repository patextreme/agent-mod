import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatCredits, parseCredits } from "./parse.js";

describe("parseCredits", () => {
  it("extracts a numeric credits balance", () => {
    assert.strictEqual(parseCredits('{"credits": 12.3456}'), 12.3456);
  });

  it("ignores the other response fields", () => {
    const body = JSON.stringify({
      credits: 15.0324,
      requests_plan: null,
      usable_requests: null,
      usage: { "deepseek-v4-flash": { total_tokens: 51714 } },
    });
    assert.strictEqual(parseCredits(body), 15.0324);
  });

  it("preserves full precision", () => {
    assert.strictEqual(parseCredits('{"credits": 15.0324}'), 15.0324);
  });

  it("accepts an integer balance", () => {
    assert.strictEqual(parseCredits('{"credits": 5}'), 5);
  });

  it("accepts a zero balance", () => {
    assert.strictEqual(parseCredits('{"credits": 0}'), 0);
  });

  it("returns null when credits is missing", () => {
    assert.strictEqual(parseCredits('{"usage": {}}'), null);
  });

  it("returns null when credits is null", () => {
    assert.strictEqual(parseCredits('{"credits": null}'), null);
  });

  it("returns null when credits is a string", () => {
    assert.strictEqual(parseCredits('{"credits": "12.34"}'), null);
  });

  it("returns null when credits is an object", () => {
    assert.strictEqual(parseCredits('{"credits": {}}'), null);
  });

  it("returns null when credits is non-finite (1e999 overflows to Infinity)", () => {
    assert.strictEqual(parseCredits('{"credits": 1e999}'), null);
  });

  it("returns null for malformed JSON", () => {
    assert.strictEqual(parseCredits("{not json"), null);
  });

  it("returns null for an empty string", () => {
    assert.strictEqual(parseCredits(""), null);
  });

  it("returns null when the top level is an array", () => {
    assert.strictEqual(parseCredits("[1, 2, 3]"), null);
  });

  it("returns null when the top level is a bare number", () => {
    assert.strictEqual(parseCredits("12.34"), null);
  });
});

describe("formatCredits", () => {
  it("formats a fractional balance at full precision", () => {
    assert.strictEqual(formatCredits(15.0324), "crof: $15.0324");
  });

  it("pads a short fraction to 4 decimal places", () => {
    assert.strictEqual(formatCredits(12.3), "crof: $12.3000");
    assert.strictEqual(formatCredits(12.345), "crof: $12.3450");
  });

  it("formats an integer balance with 4 trailing zeros", () => {
    assert.strictEqual(formatCredits(5), "crof: $5.0000");
  });

  it("formats zero", () => {
    assert.strictEqual(formatCredits(0), "crof: $0.0000");
  });
});
