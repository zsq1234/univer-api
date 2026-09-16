import type { Server as HttpServer } from "node:http";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { ApiReference } from "@univer-cli/api-reference";
import { z } from "zod";
import { executeApiQuery, formatApiQueryResponse, type ApiQueryResponse } from "./core.js";

export const MCP_SERVER_NAME = "univer-api";
export const MCP_SERVER_VERSION = "0.1.0";
export const DEFAULT_MCP_PATH = "/mcp";

export interface McpHttpServerOptions {
  readonly host?: string;
  readonly path?: string;
  readonly port?: number;
  readonly reference?: ApiReference;
}

export function createUniverMcpServer(reference?: ApiReference): McpServer {
  const server = new McpServer(
    { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
    {
      instructions:
        "Search and inspect the version-matched Univer Facade API reference. " +
        "Use univer_api_find to discover symbols, then univer_api_show for their full definitions.",
    },
  );

  server.registerTool(
    "univer_api_find",
    {
      title: "Find Univer APIs",
      description:
        "Search the Univer Facade API reference by one or more terms. Returns matching symbols and summaries.",
      inputSchema: {
        terms: z.array(z.string().trim().min(1)).min(1).describe("Terms to search for."),
        unit: z
          .enum(["sheet", "slide", "doc", "base", "board"])
          .optional()
          .describe("Optional Univer unit to search within."),
        limit: z.number().int().positive().optional().describe("Maximum matches per search term."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ terms, unit, limit }) =>
      toolResult(
        queryReference(
          {
            action: "find",
            terms,
            ...(unit === undefined ? {} : { unit }),
            ...(limit === undefined ? {} : { limit }),
          },
          reference,
        ),
      ),
  );

  server.registerTool(
    "univer_api_show",
    {
      title: "Show Univer APIs",
      description:
        "Return full reference definitions for one or more exact Univer API symbols.",
      inputSchema: {
        symbols: z
          .array(z.string().trim().min(1))
          .min(1)
          .describe("Exact API symbols, for example FRange.setValues."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ symbols }) => toolResult(queryReference({ action: "show", symbols }, reference)),
  );

  return server;
}

export async function runMcpStdioServer(reference?: ApiReference): Promise<void> {
  const server = createUniverMcpServer(reference);
  await server.connect(new StdioServerTransport());
}

export function createMcpHttpServer(options: McpHttpServerOptions = {}): HttpServer {
  const path = normalizePath(options.path ?? DEFAULT_MCP_PATH);
  return createServer((request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    if (url.pathname !== path) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found\n");
      return;
    }

    if (request.method !== "POST") {
      response.writeHead(405, {
        allow: "POST",
        "content-type": "application/json; charset=utf-8",
      });
      response.end(
        `${JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32_000, message: "Method not allowed." },
          id: null,
        })}\n`,
      );
      return;
    }

    void handleMcpHttpRequest(request, response, options.reference);
  });
}

export async function startMcpHttpServer(options: McpHttpServerOptions = {}): Promise<HttpServer> {
  const host = options.host ?? process.env["MCP_HOST"] ?? "127.0.0.1";
  const port = options.port ?? parsePort(process.env["MCP_PORT"] ?? "3001");
  const server = createMcpHttpServer(options);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  return server;
}

async function handleMcpHttpRequest(
  request: Parameters<StreamableHTTPServerTransport["handleRequest"]>[0],
  response: Parameters<StreamableHTTPServerTransport["handleRequest"]>[1],
  reference?: ApiReference,
): Promise<void> {
  const server = createUniverMcpServer(reference);
  const transport = new StreamableHTTPServerTransport({
    enableJsonResponse: true,
  });
  try {
    // The SDK's transport setter types conflict with exactOptionalPropertyTypes.
    await server.connect(transport as unknown as Transport);
    await transport.handleRequest(request, response);
  } catch {
    if (!response.headersSent) {
      response.writeHead(500, { "content-type": "application/json; charset=utf-8" });
      response.end(
        `${JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32_603, message: "Internal server error." },
          id: null,
        })}\n`,
      );
    } else if (!response.writableEnded) {
      response.end();
    }
  } finally {
    await Promise.allSettled([transport.close(), server.close()]);
  }
}

function queryReference(input: unknown, reference?: ApiReference): ApiQueryResponse {
  return reference === undefined ? executeApiQuery(input) : executeApiQuery(input, reference);
}

function toolResult(response: ApiQueryResponse): {
  content: [{ type: "text"; text: string }];
  isError: boolean;
} {
  return {
    content: [{ type: "text", text: formatApiQueryResponse(response) }],
    isError: !response.ok,
  };
}

function normalizePath(value: string): string {
  const path = value.trim();
  if (!path.startsWith("/") || path.includes("?") || path.includes("#")) {
    throw new TypeError("MCP path must be an absolute URL path without a query or fragment.");
  }
  return path;
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new TypeError("MCP_PORT must be an integer between 0 and 65535.");
  }
  return port;
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && pathToFileURL(entry).href === import.meta.url;
}

if (isMainModule()) await runMcpStdioServer();
