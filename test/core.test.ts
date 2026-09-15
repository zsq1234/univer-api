import { describe, expect, it } from "vitest";
import { executeApiQuery, normalizeApiQuery } from "../src/core.js";

describe("unified API query contract", () => {
  it("finds Facade members", () => {
    const response = executeApiQuery({ action: "find", terms: ["setValues"], unit: "sheet" });

    expect(response.ok).toBe(true);
    expect(response.schemaVersion).toBe("univer-api-response/v1");
    expect(JSON.stringify(response.results)).toContain("FRange.setValues");
  });

  it("returns exact show results", () => {
    const response = executeApiQuery({ action: "show", symbols: ["FRange.setValues"] });

    expect(response.ok).toBe(true);
    expect(response.summary).toMatchObject({ foundCount: 1, notFoundCount: 0 });
  });

  it("keeps not-found results in the common failure envelope", () => {
    const response = executeApiQuery({ action: "show", symbols: ["DefinitelyMissingSymbol"] });

    expect(response.ok).toBe(false);
    if (response.ok) throw new Error("Expected failure.");
    expect(response.error.code).toBe("API_SYMBOL_NOT_FOUND");
    expect(response.summary.notFoundCount).toBe(1);
    expect(response.results).toHaveLength(1);
  });

  it("validates transport-neutral requests", () => {
    expect(() => normalizeApiQuery({ action: "find", terms: [], unit: "sheet" })).toThrow(
      "at least one",
    );
  });
});
