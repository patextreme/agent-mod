import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  effectiveMultiplier,
  formatCountdown,
  formatWindow,
  isPeakActive,
  nextRepaintAt,
  nextTransition,
  parseCatalog,
  scheduleForModel,
} from "./peak.js";

const DEEPSEEK_RULE = {
  when: {
    utc_days: { in: ["mon", "tue", "wed", "thu", "fri"] },
    any: [
      {
        all: [{ utc_hours: { gte: "01:00" } }, { utc_hours: { lt: "04:00" } }],
      },
      {
        all: [{ utc_hours: { gte: "06:00" } }, { utc_hours: { lt: "10:00" } }],
      },
    ],
  },
  factor: 2,
};

const CATALOG = JSON.stringify({
  object: "list",
  data: [
    {
      id: "deepseek-v4.1-flash",
      cost: { multipliers: [DEEPSEEK_RULE] },
    },
    {
      id: "gemini-4-argon",
      cost: {
        multipliers: [{ when: { date: { gte: "2026-12-01" } }, factor: 2 }],
      },
    },
    { id: "plain", cost: { multipliers: [] } },
    { id: "no-cost" },
  ],
});

function at(iso: string): Date {
  return new Date(iso);
}

function deepseekSchedule() {
  const catalog = parseCatalog(CATALOG);
  assert.ok(catalog !== null);
  const schedule = scheduleForModel(catalog, "deepseek-v4.1-flash");
  assert.ok(schedule !== null);
  return schedule;
}

function withTimeZone(timeZone: string, run: () => void): void {
  const previous = process.env.TZ;
  process.env.TZ = timeZone;
  try {
    run();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}

describe("parseCatalog and scheduleForModel", () => {
  it("keeps recurring weekday/hour multipliers for their model", () => {
    assert.ok(deepseekSchedule().length > 0);
  });

  it("does not tag a model whose only multiplier is date-based", () => {
    const catalog = parseCatalog(CATALOG);
    assert.ok(catalog !== null);
    assert.strictEqual(scheduleForModel(catalog, "gemini-4-argon"), null);
  });

  it("does not tag a model with no multipliers or no cost block", () => {
    const catalog = parseCatalog(CATALOG);
    assert.ok(catalog !== null);
    assert.strictEqual(scheduleForModel(catalog, "plain"), null);
    assert.strictEqual(scheduleForModel(catalog, "no-cost"), null);
  });

  it("does not tag a model absent from the catalog", () => {
    const catalog = parseCatalog(CATALOG);
    assert.ok(catalog !== null);
    assert.strictEqual(scheduleForModel(catalog, "unknown-model"), null);
  });

  it("accepts an empty catalog", () => {
    const catalog = parseCatalog('{"object":"list","data":[]}');
    assert.ok(catalog !== null);
    assert.strictEqual(scheduleForModel(catalog, "anything"), null);
  });

  it("accepts a valid catalog whose models have no recurring multipliers", () => {
    const catalog = parseCatalog(
      JSON.stringify({
        data: [{ id: "plain", cost: { multipliers: [] } }, { id: "no-cost" }],
      }),
    );
    assert.ok(catalog !== null);
    assert.strictEqual(scheduleForModel(catalog, "plain"), null);
    assert.strictEqual(scheduleForModel(catalog, "no-cost"), null);
  });

  it("rejects a non-empty catalog with no usable model id", () => {
    assert.strictEqual(
      parseCatalog(
        JSON.stringify({
          data: [null, { id: 42 }, { id: "" }, { cost: { multipliers: [] } }],
        }),
      ),
      null,
    );
  });

  it("rejects a malformed catalog body", () => {
    assert.strictEqual(parseCatalog("{not json"), null);
    assert.strictEqual(parseCatalog('{"object":"list"}'), null);
    assert.strictEqual(parseCatalog('{"object":"list","data":{}}'), null);
    assert.strictEqual(parseCatalog("[]"), null);
  });

  it("ignores a multiplier that mixes a date clause with a recurring clause", () => {
    const catalog = parseCatalog(
      JSON.stringify({
        data: [
          {
            id: "mixed",
            cost: {
              multipliers: [
                {
                  when: {
                    any: [
                      { utc_days: { in: ["mon"] } },
                      { date: { gte: "2026-12-01" } },
                    ],
                  },
                  factor: 2,
                },
              ],
            },
          },
        ],
      }),
    );
    assert.ok(catalog !== null);
    assert.strictEqual(scheduleForModel(catalog, "mixed"), null);
  });

  it("ignores malformed entries without losing valid models", () => {
    const catalog = parseCatalog(
      JSON.stringify({
        data: [
          null,
          { id: 42 },
          {
            id: "bad-factor",
            cost: { multipliers: [{ ...DEEPSEEK_RULE, factor: "2" }] },
          },
          { id: "bad-when", cost: { multipliers: [{ when: 5, factor: 2 }] } },
          { id: "deepseek-v4.1-flash", cost: { multipliers: [DEEPSEEK_RULE] } },
        ],
      }),
    );
    assert.ok(catalog !== null);
    assert.strictEqual(scheduleForModel(catalog, "bad-factor"), null);
    assert.strictEqual(scheduleForModel(catalog, "bad-when"), null);
    assert.ok(scheduleForModel(catalog, "deepseek-v4.1-flash") !== null);
  });
});

describe("isPeakActive at weekday boundaries", () => {
  const schedule = deepseekSchedule();
  const cases: Array<[string, boolean]> = [
    ["2026-11-16T00:59:59Z", false],
    ["2026-11-16T01:00:00Z", true],
    ["2026-11-16T03:59:59Z", true],
    ["2026-11-16T04:00:00Z", false],
    ["2026-11-16T05:59:59Z", false],
    ["2026-11-16T06:00:00Z", true],
    ["2026-11-16T09:59:59Z", true],
    ["2026-11-16T10:00:00Z", false],
  ];
  for (const [iso, expected] of cases) {
    it(`${iso} is ${expected ? "peak" : "off-peak"}`, () => {
      assert.strictEqual(isPeakActive(schedule, at(iso)), expected);
    });
  }
});

describe("isPeakActive on weekends", () => {
  const schedule = deepseekSchedule();
  const cases = [
    "2026-11-14T01:00:00Z", // Saturday
    "2026-11-14T03:59:59Z",
    "2026-11-14T06:00:00Z",
    "2026-11-14T09:59:59Z",
    "2026-11-15T01:00:00Z", // Sunday
    "2026-11-15T06:00:00Z",
  ];
  for (const iso of cases) {
    it(`${iso} is off-peak`, () => {
      assert.strictEqual(isPeakActive(schedule, at(iso)), false);
    });
  }
});

describe("effectiveMultiplier", () => {
  it("multiplies every matching rule", () => {
    const catalog = parseCatalog(
      JSON.stringify({
        data: [
          {
            id: "stacked",
            cost: {
              multipliers: [
                { when: { utc_days: { in: ["mon"] } }, factor: 2 },
                {
                  when: { utc_hours: { gte: "01:00", lt: "04:00" } },
                  factor: 2,
                },
              ],
            },
          },
        ],
      }),
    );
    assert.ok(catalog !== null);
    const schedule = scheduleForModel(catalog, "stacked");
    assert.ok(schedule !== null);
    assert.strictEqual(
      effectiveMultiplier(schedule, at("2026-11-16T02:00:00Z")),
      4,
    );
    assert.strictEqual(
      isPeakActive(schedule, at("2026-11-16T02:00:00Z")),
      true,
    );
    assert.strictEqual(
      effectiveMultiplier(schedule, at("2026-11-16T05:00:00Z")),
      2,
    );
    assert.strictEqual(
      effectiveMultiplier(schedule, at("2026-11-17T02:00:00Z")),
      2,
    );
    assert.strictEqual(
      effectiveMultiplier(schedule, at("2026-11-17T05:00:00Z")),
      1,
    );
  });

  it("stays off-peak when every matching factor is at most one", () => {
    const catalog = parseCatalog(
      JSON.stringify({
        data: [
          {
            id: "discount",
            cost: {
              multipliers: [
                { when: { utc_days: { in: ["mon"] } }, factor: 0.5 },
              ],
            },
          },
        ],
      }),
    );
    assert.ok(catalog !== null);
    const schedule = scheduleForModel(catalog, "discount");
    assert.ok(schedule !== null);
    assert.strictEqual(
      effectiveMultiplier(schedule, at("2026-11-16T02:00:00Z")),
      0.5,
    );
    assert.strictEqual(
      isPeakActive(schedule, at("2026-11-16T02:00:00Z")),
      false,
    );
  });
});

describe("nextTransition", () => {
  const schedule = deepseekSchedule();

  it("wakes at the end of the first weekday peak window", () => {
    assert.strictEqual(
      nextTransition(schedule, at("2026-11-16T03:59:59Z"))?.toISOString(),
      "2026-11-16T04:00:00.000Z",
    );
  });

  it("wakes at the start of the second weekday peak window", () => {
    assert.strictEqual(
      nextTransition(schedule, at("2026-11-16T05:59:59Z"))?.toISOString(),
      "2026-11-16T06:00:00.000Z",
    );
  });

  it("wakes at the end of the second weekday peak window", () => {
    assert.strictEqual(
      nextTransition(schedule, at("2026-11-16T09:59:59Z"))?.toISOString(),
      "2026-11-16T10:00:00.000Z",
    );
  });

  it("spans the 63-hour Friday-to-Monday off-peak gap", () => {
    const friday = at("2026-11-13T10:00:00Z");
    const monday = at("2026-11-16T01:00:00Z");
    assert.strictEqual(
      nextTransition(schedule, friday)?.toISOString(),
      monday.toISOString(),
    );
    assert.strictEqual(
      (monday.getTime() - friday.getTime()) / (60 * 60 * 1000),
      63,
    );
  });
});

describe("formatCountdown", () => {
  const schedule = deepseekSchedule();

  it("prints days and hours across the weekend gap", () => {
    assert.strictEqual(
      formatCountdown(schedule, at("2026-11-13T10:00:00Z")),
      "2d15h left",
    );
  });

  it("elides a zero secondary unit", () => {
    assert.strictEqual(
      formatCountdown(schedule, at("2026-11-15T01:00:00Z")),
      "1d left",
    );
  });

  it("prints hours and zero-padded minutes", () => {
    assert.strictEqual(
      formatCountdown(schedule, at("2026-11-16T06:59:00Z")),
      "3h01m left",
    );
  });

  it("prints whole minutes under one hour", () => {
    assert.strictEqual(
      formatCountdown(schedule, at("2026-11-16T09:13:00Z")),
      "47m left",
    );
  });

  it("prints a minute at the one-minute boundary", () => {
    assert.strictEqual(
      formatCountdown(schedule, at("2026-11-16T09:59:00Z")),
      "1m left",
    );
  });

  it("prints under a minute below the minute boundary", () => {
    assert.strictEqual(
      formatCountdown(schedule, at("2026-11-16T09:59:30Z")),
      "under a minute left",
    );
  });
});

describe("formatWindow", () => {
  const schedule = deepseekSchedule();

  it("keeps the same-day peak format from the spec", () => {
    withTimeZone("Etc/GMT-7", () => {
      assert.strictEqual(
        formatWindow(schedule, at("2026-11-16T09:13:00Z")),
        "peak until 10:00 UTC (17:00 +07)",
      );
    });
  });

  it("names the UTC and local weekday across the Friday-to-Monday gap", () => {
    withTimeZone("Etc/GMT-7", () => {
      assert.strictEqual(
        formatWindow(schedule, at("2026-11-13T10:00:00Z")),
        "off-peak until Mon 01:00 UTC (Mon 08:00 +07)",
      );
    });
  });

  it("names the local weekday when the boundary falls on the previous local date", () => {
    withTimeZone("Etc/GMT+5", () => {
      assert.strictEqual(
        formatWindow(schedule, at("2026-11-13T10:00:00Z")),
        "off-peak until Mon 01:00 UTC (Sun 20:00 -05)",
      );
    });
  });

  it("names the local weekday when its date differs from the UTC date", () => {
    withTimeZone("Etc/GMT+10", () => {
      assert.strictEqual(
        formatWindow(schedule, at("2026-11-16T00:30:00Z")),
        "off-peak until 01:00 UTC (Sun 15:00 -10)",
      );
    });
  });
});

describe("nextRepaintAt", () => {
  const schedule = deepseekSchedule();

  const cases: Array<[string, string]> = [
    ["2026-11-13T10:00:30Z", "2026-11-13T11:00:00.001Z"],
    ["2026-11-15T01:00:00Z", "2026-11-15T01:00:00.001Z"],
    ["2026-11-16T06:59:30Z", "2026-11-16T07:00:00.001Z"],
    ["2026-11-16T09:13:30Z", "2026-11-16T09:14:00.001Z"],
    ["2026-11-16T09:59:30Z", "2026-11-16T10:00:00.000Z"],
    ["2026-11-16T03:59:30Z", "2026-11-16T04:00:00.000Z"],
  ];

  for (const [iso, expected] of cases) {
    it(`repaints exactly when the countdown text changes at ${iso}`, () => {
      const now = at(iso);
      const repaint = nextRepaintAt(schedule, now);
      assert.ok(repaint !== null);
      assert.strictEqual(repaint.toISOString(), expected);
      assert.strictEqual(
        formatCountdown(schedule, new Date(repaint.getTime() - 1)),
        formatCountdown(schedule, now),
      );
      assert.notStrictEqual(
        formatCountdown(schedule, repaint),
        formatCountdown(schedule, now),
      );
    });
  }

  it("repaints at the next hour while the countdown shows days and hours", () => {
    assert.strictEqual(
      nextRepaintAt(schedule, at("2026-11-13T10:00:30Z"))?.toISOString(),
      "2026-11-13T11:00:00.001Z",
    );
  });

  it("repaints at the next minute while the countdown shows hours and minutes", () => {
    assert.strictEqual(
      nextRepaintAt(schedule, at("2026-11-16T06:59:30Z"))?.toISOString(),
      "2026-11-16T07:00:00.001Z",
    );
  });

  it("repaints at the transition when the countdown is under a minute", () => {
    assert.strictEqual(
      nextRepaintAt(schedule, at("2026-11-16T09:59:30Z"))?.toISOString(),
      "2026-11-16T10:00:00.000Z",
    );
  });

  it("never repaints after the state boundary", () => {
    assert.strictEqual(
      nextRepaintAt(schedule, at("2026-11-16T03:59:30Z"))?.toISOString(),
      "2026-11-16T04:00:00.000Z",
    );
  });
});
