# univer-api

`univer-api` exposes the version-matched Univer Facade API reference through four adapters without
using `@univer-cli/api-reference-command`:

- a browser page that queries the reference locally;
- a Node.js HTTP server;
- a dependency-light CLI adapter;
- an MCP server over Streamable HTTP or stdin/stdout (`stdio`).

All four adapters call `executeApiQuery()` and return one `univer-api-response/v1` JSON envelope.
The only reference dependency is `@univer-cli/api-reference@1.0.0-rc.0`.

## Setup

Node.js 22.12 or newer and pnpm are required.

```bash
pnpm install
pnpm check
```

## Unified request and response

Find request:

```json
{
  "action": "find",
  "terms": ["setValues"],
  "unit": "sheet",
  "limit": 25
}
```

Show request:

```json
{
  "action": "show",
  "symbols": ["FRange.setValues", "ICellData.v"]
}
```

Every adapter returns the same envelope shape:

```json
{
  "schemaVersion": "univer-api-response/v1",
  "ok": true,
  "request": {},
  "results": [],
  "summary": {
    "queryCount": 0,
    "resultCount": 0,
    "foundCount": 0,
    "notFoundCount": 0
  }
}
```

Validation, reference execution, and missing-symbol failures add an `error` object while preserving
the same envelope. A `show` request containing a missing symbol sets `ok` to `false` and keeps every
per-symbol result in `results`.

## Browser page

Build and start the server, then open <http://127.0.0.1:3000>:

```bash
pnpm build
pnpm server
```

The page imports the browser bundle and calls the reference locally. It does not need the HTTP API
to execute a query.

Browser applications can also import the shared entry with a bundler:

```ts
import { executeApiQuery } from "univer-api";

const response = executeApiQuery({ action: "find", terms: ["setValues"], unit: "sheet" });
```

## Node.js server

The server exposes:

```text
POST /api/query
GET  /api/find?term=setValues&unit=sheet&limit=25
GET  /api/show?symbol=FRange.setValues
GET  /healthz
```

Example:

```bash
curl -sS http://127.0.0.1:3000/api/query \
  -H 'content-type: application/json' \
  --data '{"action":"show","symbols":["FRange.setValues"]}'
```

Set `HOST` and `PORT` to change the listener. The defaults are `127.0.0.1:3000`.

Programmatic use:

```ts
import { createApiServer } from "univer-api/server";

createApiServer().listen(3000, "127.0.0.1");
```

## CLI

```bash
pnpm cli find setValues --unit sheet --limit 10
pnpm cli show FRange.setValues ICellData.v
```

After installation or linking, use the `univer-api` bin:

```bash
univer-api find setValues --unit sheet
univer-api show FRange.setValues
```

Queries always emit exactly one JSON document to stdout. Invalid arguments exit with code 2;
reference or missing-symbol failures exit with code 1.

## MCP server

The MCP server exposes two read-only tools backed by the same API reference:

- `univer_api_find` searches for API symbols by `terms`, with optional `unit` and `limit`;
- `univer_api_show` returns full definitions for exact `symbols`.

Use the standard stdin/stdout transport (the default) from an MCP client configuration:

```json
{
  "mcpServers": {
    "univer-api": {
      "command": "univer-api-mcp"
    }
  }
}
```

For local development without installing the bin:

```bash
pnpm mcp
```

`--transport stdout` is accepted as an alias for `stdio`. Stdout is reserved exclusively for MCP
JSON-RPC messages; diagnostics are written to stderr.

Start a stateless Streamable HTTP server at `http://127.0.0.1:3001/mcp`:

```bash
univer-api-mcp --transport http
# or during development
pnpm mcp:http --host 127.0.0.1 --port 3001 --path /mcp
```

`MCP_HOST` and `MCP_PORT` provide the HTTP defaults. The server binds to loopback by default; add
authentication or an authenticated reverse proxy before exposing it outside a trusted machine.

Programmatic use is available from the dedicated Node.js export so browser bundles stay free of
MCP server dependencies:

```ts
import { createUniverMcpServer, startMcpHttpServer } from "univer-api/mcp";

const mcp = createUniverMcpServer();
const httpServer = await startMcpHttpServer({ port: 3001 });
```

## Architecture

```text
@univer-cli/api-reference
             |
       executeApiQuery
       /      |      |       \
 browser   HTTP     CLI      MCP
 page      server   process  HTTP/stdio
       \      |      |       /
   univer-api-response/v1
```

`src/core.ts` owns validation, reference invocation, error mapping, summaries, and serialization.
The browser, HTTP server, CLI, and MCP files contain transport-specific parsing only.
