import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApiServer } from "../src/server.js";

let server: Server | undefined;
let temporaryDirectory: string | undefined;

afterEach(async () => {
  if (server !== undefined) await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = undefined;
  if (temporaryDirectory !== undefined) await rm(temporaryDirectory, { force: true, recursive: true });
  temporaryDirectory = undefined;
});

describe("HTTP adapter", () => {
  it("returns the same response envelope", async () => {
    server = createApiServer();
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (typeof address !== "object" || address === null) throw new Error("Missing server address.");

    const response = await fetch(`http://127.0.0.1:${address.port}/api/query`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "show", symbols: ["FRange.setValues"] }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      request: { action: "show", symbols: ["FRange.setValues"] },
      schemaVersion: "univer-api-response/v1",
    });
  });

  it("serves generated browser chunks without exposing arbitrary paths", async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), "univer-api-web-"));
    await mkdir(join(temporaryDirectory, "chunks"));
    await writeFile(join(temporaryDirectory, "chunks", "chunk-ABC123.js"), "export const ok=true;\n");
    server = createApiServer({ webRoot: temporaryDirectory });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (typeof address !== "object" || address === null) throw new Error("Missing server address.");

    const chunk = await fetch(`http://127.0.0.1:${address.port}/chunks/chunk-ABC123.js`);
    const traversal = await fetch(
      `http://127.0.0.1:${address.port}/chunks/%2e%2e%2fpackage.json`,
    );

    expect(chunk.status).toBe(200);
    expect(chunk.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
    expect(await chunk.text()).toBe("export const ok=true;\n");
    expect(traversal.status).toBe(404);
  });
});
