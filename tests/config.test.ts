import { describe, it, expect } from "vitest";
import { experimentId, configToQuery, parseConfigFromParams, toCSV, configToText } from "@/lib/experiment/config";

describe("experiment IDs", () => {
  it("is deterministic for the same configuration", () => {
    const config = { seed: 42, volatility: 0.2, steps: 252 };
    expect(experimentId("MC", config)).toBe(experimentId("MC", config));
  });

  it("does not depend on key insertion order", () => {
    expect(experimentId("MC", { a: 1, b: 2 })).toBe(experimentId("MC", { b: 2, a: 1 }));
  });

  it("changes when any value changes", () => {
    expect(experimentId("MC", { seed: 42 })).not.toBe(experimentId("MC", { seed: 43 }));
  });

  it("carries the given prefix and a fixed-width suffix", () => {
    const id = experimentId("REG", { seed: 1 });
    expect(id.startsWith("REG-")).toBe(true);
    expect(id.split("-")[1]).toHaveLength(6);
  });
});

describe("URL round-trip", () => {
  const schema = {
    seed: { type: "integer" as const, min: 0, max: 1e9 },
    volatility: { type: "number" as const, min: 0, max: 3 },
    showPaths: { type: "boolean" as const },
    mode: { type: "string" as const, options: ["a", "b"] },
  };
  const defaults = { seed: 42, volatility: 0.2, showPaths: true, mode: "a" };

  it("round-trips a configuration through the query string", () => {
    const config = { seed: 7, volatility: 0.35, showPaths: false, mode: "b" };
    const parsed = parseConfigFromParams(new URLSearchParams(configToQuery(config)), schema, defaults);
    expect(parsed).toEqual(config);
  });

  it("falls back to the default for an out-of-range value", () => {
    const parsed = parseConfigFromParams(new URLSearchParams("volatility=-5"), schema, defaults);
    expect(parsed.volatility).toBe(0.2);
  });

  it("falls back to the default for a non-numeric value", () => {
    const parsed = parseConfigFromParams(new URLSearchParams("volatility=abc&seed=NaN"), schema, defaults);
    expect(parsed.volatility).toBe(0.2);
    expect(parsed.seed).toBe(42);
  });

  it("rejects Infinity", () => {
    const parsed = parseConfigFromParams(new URLSearchParams("volatility=Infinity"), schema, defaults);
    expect(parsed.volatility).toBe(0.2);
  });

  it("rejects a non-integer where an integer is required", () => {
    const parsed = parseConfigFromParams(new URLSearchParams("seed=4.5"), schema, defaults);
    expect(parsed.seed).toBe(42);
  });

  it("rejects a string outside the allowed options", () => {
    const parsed = parseConfigFromParams(new URLSearchParams("mode=zzz"), schema, defaults);
    expect(parsed.mode).toBe("a");
  });

  it("accepts 1 and 0 as booleans", () => {
    expect(parseConfigFromParams(new URLSearchParams("showPaths=0"), schema, defaults).showPaths).toBe(false);
    expect(parseConfigFromParams(new URLSearchParams("showPaths=1"), schema, defaults).showPaths).toBe(true);
  });

  it("ignores unknown parameters", () => {
    const parsed = parseConfigFromParams(new URLSearchParams("nonsense=1&seed=9"), schema, defaults);
    expect(parsed.seed).toBe(9);
    expect(Object.keys(parsed).sort()).toEqual(["mode", "seed", "showPaths", "volatility"]);
  });

  it("accepts a plain record as well as URLSearchParams", () => {
    const parsed = parseConfigFromParams({ seed: "11" }, schema, defaults);
    expect(parsed.seed).toBe(11);
  });
});

describe("CSV export", () => {
  it("writes a header and rows", () => {
    const csv = toCSV([{ a: 1, b: 2 }, { a: 3, b: 4 }]);
    expect(csv).toBe("a,b\n1,2\n3,4");
  });

  it("quotes values containing commas, quotes or newlines", () => {
    const csv = toCSV([{ note: 'a,b', other: 'say "hi"' }]);
    expect(csv).toContain('"a,b"');
    expect(csv).toContain('"say ""hi"""');
  });

  it("renders null as an empty field", () => {
    expect(toCSV([{ a: null, b: 1 }])).toBe("a,b\n,1");
  });

  it("returns an empty string for no rows", () => {
    expect(toCSV([])).toBe("");
  });

  it("respects an explicit column order", () => {
    expect(toCSV([{ a: 1, b: 2 }], ["b", "a"])).toBe("b,a\n2,1");
  });
});

describe("configToText", () => {
  it("includes the title, id and every parameter", () => {
    const text = configToText("Monte Carlo", { seed: 42, sigma: 0.2 }, { sigma: "Volatility" }, "MC-ABC123");
    expect(text).toContain("Monte Carlo");
    expect(text).toContain("MC-ABC123");
    expect(text).toContain("seed: 42");
    expect(text).toContain("Volatility: 0.2");
  });
});
