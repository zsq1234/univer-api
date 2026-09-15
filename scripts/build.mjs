import { chmod, cp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { build } from "esbuild";

const root = new URL("../", import.meta.url);
const path = (value) => join(root.pathname, value);

await rm(path("dist"), { force: true, recursive: true });
await mkdir(path("dist/node"), { recursive: true });
await mkdir(path("dist/web"), { recursive: true });

await build({
  bundle: true,
  chunkNames: "chunks/[name]-[hash]",
  entryNames: "[name]",
  entryPoints: {
    cli: path("src/cli.ts"),
    index: path("src/index.ts"),
    server: path("src/server.ts"),
  },
  format: "esm",
  legalComments: "none",
  minify: true,
  outdir: path("dist/node"),
  platform: "node",
  splitting: true,
  target: "node22.12",
});

await build({
  bundle: true,
  chunkNames: "chunks/[name]-[hash]",
  entryNames: "[name]",
  entryPoints: {
    api: path("src/index.ts"),
    app: path("src/web.ts"),
  },
  format: "esm",
  legalComments: "none",
  minify: true,
  outdir: path("dist/web"),
  platform: "browser",
  splitting: true,
  target: "es2022",
});

await cp(path("web/index.html"), path("dist/web/index.html"));
await cp(path("web/styles.css"), path("dist/web/styles.css"));
await chmod(path("dist/node/cli.js"), 0o755);
