import type { Server } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it } from "vitest";
import { parseMcpCliOptions } from "../src/mcp-cli.js";
import { createMcpHttpServer, createUniverMcpServer } from "../src/mcp.js";

let httpServer: Server | undefined;
const clients: Client[] = [];

afterEach(async () => {
  await Promise.allSettled(clients.splice(0).map(async (client) => client.close()));
  if (httpServer !== undefined) {
    await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
    httpServer = undefined;
  }
});

describe("MCP server", () => {
  it("lists and calls the API reference tools", async () => {
    const server = createUniverMcpServer();
    const client = new Client({ name: "univer-api-test", version: "1.0.0" });
    clients.push(client);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport as unknown as Transport),
      client.connect(clientTransport as unknown as Transport),
    ]);

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual([
      "univer_api_find",
      "univer_api_show",
    ]);

    const result = await client.callTool(
      {
        name: "univer_api_show",
        arguments: { symbols: ["FRange.setValues"] },
      },
      CallToolResultSchema,
    );
    expect(result.isError).not.toBe(true);
    expect(JSON.parse(textContent(result))).toMatchObject({
      ok: true,
      request: { action: "show", symbols: ["FRange.setValues"] },
      schemaVersion: "univer-api-response/v1",
    });

    await server.close();
  });

  it("supports Streamable HTTP", async () => {
    httpServer = createMcpHttpServer();
    await new Promise<void>((resolve) => httpServer!.listen(0, "127.0.0.1", resolve));
    const address = httpServer.address();
    if (typeof address !== "object" || address === null) throw new Error("Missing address.");

    const client = new Client({ name: "univer-api-http-test", version: "1.0.0" });
    clients.push(client);
    const transport = new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${address.port}/mcp`),
    );
    await client.connect(transport as unknown as Transport);

    const result = await client.callTool(
      {
        name: "univer_api_find",
        arguments: { terms: ["setValues"], unit: "sheet", limit: 2 },
      },
      CallToolResultSchema,
    );
    expect(result.isError).not.toBe(true);
    expect(textContent(result)).toContain("univer-api-response/v1");
  });

  it("supports stdio", async () => {
    const client = new Client({ name: "univer-api-stdio-test", version: "1.0.0" });
    clients.push(client);
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ["--import", "tsx", "src/mcp-cli.ts"],
      cwd: process.cwd(),
      stderr: "pipe",
    });
    await client.connect(transport as unknown as Transport);

    const result = await client.callTool(
      {
        name: "univer_api_show",
        arguments: { symbols: ["FRange.setValues"] },
      },
      CallToolResultSchema,
    );
    expect(result.isError).not.toBe(true);
    expect(textContent(result)).toContain("univer-api-response/v1");
  });

  it("accepts stdout as an alias for stdio", () => {
    expect(parseMcpCliOptions(["--transport", "stdout"])).toEqual({ transport: "stdio" });
    expect(
      parseMcpCliOptions(["--transport=http", "--host=0.0.0.0", "--port=4321"]),
    ).toEqual({ transport: "http", host: "0.0.0.0", port: 4321 });
  });
});

function textContent(result: Record<string, unknown>): string {
  const content = result["content"];
  if (!Array.isArray(content)) throw new Error("Expected MCP content array.");
  const first: unknown = content[0];
  if (
    typeof first !== "object" ||
    first === null ||
    !("type" in first) ||
    first.type !== "text" ||
    !("text" in first) ||
    typeof first.text !== "string"
  ) {
    throw new Error("Expected text tool output.");
  }
  return first.text;
}
