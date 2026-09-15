import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { ApiReference } from "@univer-cli/api-reference";
import {
  executeApiQuery,
  formatApiQueryResponse,
  invalidApiQueryResponse,
  type ApiQueryResponse,
} from "./core.js";

const MAX_BODY_BYTES = 64 * 1024;

export interface ApiServerOptions {
  readonly reference?: ApiReference;
  readonly webRoot?: string;
}

export function createApiServer(options: ApiServerOptions = {}): Server {
  const webRoot = options.webRoot ?? defaultWebRoot();
  return createServer((request, response) => {
    void routeRequest(request, response, webRoot, options.reference).catch((error: unknown) => {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      writeJson(
        response,
        500,
        invalidApiQueryResponse(error instanceof Error ? error.message : "Internal server error."),
      );
    });
  });
}

export async function startApiServer(input: {
  readonly host?: string;
  readonly port?: number;
  readonly webRoot?: string;
} = {}): Promise<Server> {
  const host = input.host ?? process.env["HOST"] ?? "127.0.0.1";
  const port = input.port ?? parsePort(process.env["PORT"] ?? "3000");
  const server = createApiServer(input.webRoot === undefined ? {} : { webRoot: input.webRoot });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  return server;
}

async function routeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  webRoot: string,
  reference?: ApiReference,
): Promise<void> {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  if (request.method === "GET" && url.pathname === "/healthz") {
    writeJson(response, 200, { ok: true, service: "univer-api" });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/query") {
    let input: unknown;
    try {
      input = JSON.parse(await readBody(request));
    } catch (error) {
      writeJson(
        response,
        400,
        invalidApiQueryResponse(error instanceof Error ? error.message : "Invalid JSON body."),
      );
      return;
    }
    writeQueryResponse(response, queryReference(input, reference));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/find") {
    const terms = url.searchParams.getAll("term");
    writeQueryResponse(
      response,
      queryReference(
        {
          action: "find",
          terms,
          ...(url.searchParams.has("unit") ? { unit: url.searchParams.get("unit") } : {}),
          ...(url.searchParams.has("limit")
            ? { limit: Number(url.searchParams.get("limit")) }
            : {}),
        },
        reference,
      ),
    );
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/show") {
    writeQueryResponse(
      response,
      queryReference({ action: "show", symbols: url.searchParams.getAll("symbol") }, reference),
    );
    return;
  }

  const asset = request.method === "GET" ? staticAsset(url.pathname, webRoot) : undefined;
  if (asset !== undefined && (await isFile(asset.path))) {
    response.writeHead(200, {
      "cache-control": asset.cacheControl,
      "content-type": asset.contentType,
    });
    createReadStream(asset.path).pipe(response);
    return;
  }

  response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  response.end("Not found\n");
}

function writeQueryResponse(response: ServerResponse, result: ApiQueryResponse): void {
  const status = result.ok
    ? 200
    : result.error.code === "INVALID_REQUEST"
      ? 400
      : result.error.code === "API_SYMBOL_NOT_FOUND"
        ? 404
        : 500;
  writeJson(response, status, result);
}

function queryReference(input: unknown, reference: ApiReference | undefined): ApiQueryResponse {
  return reference === undefined ? executeApiQuery(input) : executeApiQuery(input, reference);
}

function writeJson(response: ServerResponse, status: number, value: unknown): void {
  const body =
    typeof value === "object" && value !== null && "schemaVersion" in value
      ? formatApiQueryResponse(value as ApiQueryResponse)
      : `${JSON.stringify(value, null, 2)}\n`;
  response.writeHead(status, {
    "content-length": Buffer.byteLength(body),
    "content-type": "application/json; charset=utf-8",
  });
  response.end(body);
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > MAX_BODY_BYTES) throw new TypeError("Request body exceeds 64 KiB.");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function staticAsset(
  pathname: string,
  webRoot: string,
): { readonly path: string; readonly contentType: string; readonly cacheControl: string } | undefined {
  const assets = new Map<string, readonly [string, string, string]>([
    ["/", ["index.html", "text/html; charset=utf-8", "no-cache"]],
    ["/app.js", ["app.js", "text/javascript; charset=utf-8", "public, max-age=3600"]],
    ["/styles.css", ["styles.css", "text/css; charset=utf-8", "public, max-age=3600"]],
  ] as const);
  const asset = assets.get(pathname);
  if (/^\/chunks\/[A-Za-z0-9_-]+\.js$/u.test(pathname)) {
    return {
      path: join(webRoot, pathname.slice(1)),
      contentType: "text/javascript; charset=utf-8",
      cacheControl: "public, max-age=31536000, immutable",
    };
  }
  return asset === undefined
    ? undefined
    : { path: join(webRoot, asset[0]), contentType: asset[1], cacheControl: asset[2] };
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

function defaultWebRoot(): string {
  const currentDirectory = dirname(fileURLToPath(import.meta.url));
  return join(currentDirectory, "..", "web");
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new TypeError("PORT must be an integer between 0 and 65535.");
  }
  return port;
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && pathToFileURL(entry).href === import.meta.url;
}

if (isMainModule()) {
  const server = await startApiServer();
  const address = server.address();
  const location = typeof address === "object" && address !== null ? address.port : 3000;
  process.stdout.write(`univer-api listening at http://127.0.0.1:${location}\n`);
}
