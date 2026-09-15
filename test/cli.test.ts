import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";

describe("CLI adapter", () => {
  it("prints the unified response", () => {
    let output = "";
    const exitCode = runCli(["show", "FRange.setValues"], {
      write: (text) => {
        output += text;
      },
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(output)).toMatchObject({
      ok: true,
      request: { action: "show", symbols: ["FRange.setValues"] },
      schemaVersion: "univer-api-response/v1",
    });
  });
});
