#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import type { ApiQuery } from "./core.js";
import {
  executeApiQuery,
  formatApiQueryResponse,
  invalidApiQueryResponse,
  normalizeApiQuery,
} from "./core.js";

export interface CliIO {
  readonly write: (text: string) => void;
}

export function runCli(argv: readonly string[], io: CliIO = defaultIO()): number {
  if (argv.includes("--help") || argv.includes("-h") || argv.length === 0) {
    io.write(helpText());
    return 0;
  }
  if (argv.includes("--version") || argv.includes("-V")) {
    io.write("0.1.0\n");
    return 0;
  }

  let request: ApiQuery;
  try {
    request = parseCliQuery(argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid CLI arguments.";
    io.write(formatApiQueryResponse(invalidApiQueryResponse(message)));
    return 2;
  }

  const response = executeApiQuery(request);
  io.write(formatApiQueryResponse(response));
  return response.ok ? 0 : 1;
}

export function parseCliQuery(argv: readonly string[]): ApiQuery {
  const [action, ...arguments_] = argv;
  if (action === "show") {
    if (arguments_.some((argument) => argument.startsWith("-"))) {
      throw new TypeError("show does not accept options.");
    }
    if (arguments_.length === 0) throw new TypeError("show requires at least one symbol.");
    return { action: "show", symbols: arguments_ };
  }
  if (action !== "find") throw new TypeError('First argument must be "find" or "show".');

  const terms: string[] = [];
  let unit: string | undefined;
  let limit: number | undefined;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]!;
    if (argument === "--unit") {
      unit = requiredOptionValue(arguments_, ++index, "--unit");
    } else if (argument.startsWith("--unit=")) {
      unit = argument.slice("--unit=".length);
    } else if (argument === "--limit") {
      limit = parseLimit(requiredOptionValue(arguments_, ++index, "--limit"));
    } else if (argument.startsWith("--limit=")) {
      limit = parseLimit(argument.slice("--limit=".length));
    } else if (argument.startsWith("-")) {
      throw new TypeError(`Unknown option: ${argument}`);
    } else {
      terms.push(argument);
    }
  }

  return normalizeCliFind({
    terms,
    ...(unit === undefined ? {} : { unit }),
    ...(limit === undefined ? {} : { limit }),
  });
}

function normalizeCliFind(input: {
  readonly terms: readonly string[];
  readonly unit?: string;
  readonly limit?: number;
}): ApiQuery {
  return normalizeApiQuery({
    action: "find",
    terms: input.terms,
    ...(input.unit === undefined ? {} : { unit: input.unit }),
    ...(input.limit === undefined ? {} : { limit: input.limit }),
  });
}

function requiredOptionValue(
  arguments_: readonly string[],
  index: number,
  option: string,
): string {
  const value = arguments_[index];
  if (value === undefined || value.startsWith("-")) {
    throw new TypeError(`${option} requires a value.`);
  }
  return value;
}

function parseLimit(value: string): number {
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1) throw new TypeError("--limit must be a positive integer.");
  return limit;
}

function helpText(): string {
  return [
    "Usage:",
    "  univer-api find <terms...> [--unit sheet|slide|doc|base|board] [--limit number]",
    "  univer-api show <symbols...>",
    "",
    "Every query prints one univer-api-response/v1 JSON document.",
    "",
  ].join("\n");
}

function defaultIO(): CliIO {
  return { write: (text) => process.stdout.write(text) };
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && pathToFileURL(entry).href === import.meta.url;
}

if (isMainModule()) process.exitCode = runCli(process.argv.slice(2));
