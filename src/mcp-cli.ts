#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { DEFAULT_MCP_PATH, runMcpStdioServer, startMcpHttpServer } from "./mcp.js";

export type McpTransportName = "http" | "stdio";

export interface McpCliOptions {
  readonly transport: McpTransportName;
  readonly host?: string;
  readonly path?: string;
  readonly port?: number;
}

export function parseMcpCliOptions(argv: readonly string[]): McpCliOptions {
  let transport: McpTransportName = "stdio";
  let host: string | undefined;
  let path: string | undefined;
  let port: number | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (argument === "--transport") {
      transport = parseTransport(requiredValue(argv, ++index, "--transport"));
    } else if (argument.startsWith("--transport=")) {
      transport = parseTransport(argument.slice("--transport=".length));
    } else if (argument === "--host") {
      host = requiredValue(argv, ++index, "--host");
    } else if (argument.startsWith("--host=")) {
      host = argument.slice("--host=".length);
    } else if (argument === "--port") {
      port = parsePort(requiredValue(argv, ++index, "--port"));
    } else if (argument.startsWith("--port=")) {
      port = parsePort(argument.slice("--port=".length));
    } else if (argument === "--path") {
      path = requiredValue(argv, ++index, "--path");
    } else if (argument.startsWith("--path=")) {
      path = argument.slice("--path=".length);
    } else {
      throw new TypeError(`Unknown option: ${argument}`);
    }
  }

  if (transport === "stdio" && (host !== undefined || port !== undefined || path !== undefined)) {
    throw new TypeError("--host, --port, and --path are only valid for the HTTP transport.");
  }
  return {
    transport,
    ...(host === undefined ? {} : { host }),
    ...(path === undefined ? {} : { path }),
    ...(port === undefined ? {} : { port }),
  };
}

export async function runMcpCli(argv: readonly string[]): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(helpText());
    return;
  }

  const options = parseMcpCliOptions(argv);
  if (options.transport === "stdio") {
    await runMcpStdioServer();
    return;
  }

  const server = await startMcpHttpServer(options);
  const address = server.address();
  const host = options.host ?? process.env["MCP_HOST"] ?? "127.0.0.1";
  const port = typeof address === "object" && address !== null ? address.port : 3001;
  process.stderr.write(
    `univer-api MCP server listening at http://${host}:${port}${options.path ?? DEFAULT_MCP_PATH}\n`,
  );
}

function parseTransport(value: string): McpTransportName {
  if (value === "stdio" || value === "stdout") return "stdio";
  if (value === "http") return value;
  throw new TypeError('--transport must be "stdio" (or "stdout") or "http".');
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new TypeError("--port must be an integer between 0 and 65535.");
  }
  return port;
}

function requiredValue(argv: readonly string[], index: number, option: string): string {
  const value = argv[index];
  if (value === undefined || value.startsWith("-")) throw new TypeError(`${option} requires a value.`);
  return value;
}

function helpText(): string {
  return [
    "Usage:",
    "  univer-api-mcp [--transport stdio]",
    `  univer-api-mcp --transport http [--host 127.0.0.1] [--port 3001] [--path ${DEFAULT_MCP_PATH}]`,
    "",
    '"stdout" is accepted as an alias for the MCP stdio transport.',
    "HTTP settings can also be supplied with MCP_HOST and MCP_PORT.",
    "",
  ].join("\n");
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && pathToFileURL(entry).href === import.meta.url;
}

if (isMainModule()) {
  runMcpCli(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "MCP server failed."}\n`);
    process.exitCode = 1;
  });
}
