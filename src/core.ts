import {
  API_REFERENCE_UNITS,
  createStandardApiReference,
  type ApiReference,
  type ApiReferenceFindTermResult,
  type ApiReferenceShowResult,
  type ApiReferenceUnit,
} from "@univer-cli/api-reference";

export const API_RESPONSE_SCHEMA_VERSION = "univer-api-response/v1" as const;

export interface FindApiQuery {
  readonly action: "find";
  readonly terms: readonly string[];
  readonly unit?: ApiReferenceUnit;
  readonly limit?: number;
}

export interface ShowApiQuery {
  readonly action: "show";
  readonly symbols: readonly string[];
}

export type ApiQuery = FindApiQuery | ShowApiQuery;
export type ApiQueryResult = ApiReferenceFindTermResult | ApiReferenceShowResult;

export interface ApiQuerySummary {
  readonly queryCount: number;
  readonly resultCount: number;
  readonly foundCount: number;
  readonly notFoundCount: number;
}

export interface ApiQueryError {
  readonly code: "INVALID_REQUEST" | "API_SYMBOL_NOT_FOUND" | "REFERENCE_QUERY_FAILED";
  readonly message: string;
}

interface ApiQueryResponseBase {
  readonly schemaVersion: typeof API_RESPONSE_SCHEMA_VERSION;
  readonly request: ApiQuery | null;
  readonly results: readonly ApiQueryResult[];
  readonly summary: ApiQuerySummary;
}

export interface ApiQuerySuccess extends ApiQueryResponseBase {
  readonly ok: true;
}

export interface ApiQueryFailure extends ApiQueryResponseBase {
  readonly ok: false;
  readonly error: ApiQueryError;
}

export type ApiQueryResponse = ApiQuerySuccess | ApiQueryFailure;

let standardReference: ApiReference | undefined;

export function executeApiQuery(
  input: unknown,
  reference: ApiReference = getStandardReference(),
): ApiQueryResponse {
  let request: ApiQuery;
  try {
    request = normalizeApiQuery(input);
  } catch (error) {
    return createFailure(null, [], "INVALID_REQUEST", errorMessage(error));
  }

  try {
    if (request.action === "find") {
      const results = reference.find({
        terms: request.terms,
        ...(request.unit === undefined ? {} : { unit: request.unit }),
        ...(request.limit === undefined ? {} : { limit: request.limit }),
      });
      return {
        schemaVersion: API_RESPONSE_SCHEMA_VERSION,
        ok: true,
        request,
        results,
        summary: summarizeFind(results),
      };
    }

    const results = reference.show(request.symbols);
    const summary = summarizeShow(results);
    if (summary.notFoundCount > 0) {
      return createFailure(
        request,
        results,
        "API_SYMBOL_NOT_FOUND",
        `${summary.notFoundCount} API symbol${summary.notFoundCount === 1 ? " was" : "s were"} not found.`,
        summary,
      );
    }
    return {
      schemaVersion: API_RESPONSE_SCHEMA_VERSION,
      ok: true,
      request,
      results,
      summary,
    };
  } catch (error) {
    return createFailure(request, [], "REFERENCE_QUERY_FAILED", errorMessage(error));
  }
}

export function formatApiQueryResponse(response: ApiQueryResponse): string {
  return `${JSON.stringify(response, null, 2)}\n`;
}

export function invalidApiQueryResponse(message: string): ApiQueryFailure {
  return createFailure(null, [], "INVALID_REQUEST", message);
}

export function normalizeApiQuery(input: unknown): ApiQuery {
  if (!isRecord(input)) throw new TypeError("Request must be a JSON object.");
  if (input["action"] === "find") {
    const terms = nonEmptyStrings(input["terms"], "terms");
    const unit = optionalUnit(input["unit"]);
    const limit = optionalPositiveInteger(input["limit"]);
    return {
      action: "find",
      terms,
      ...(unit === undefined ? {} : { unit }),
      ...(limit === undefined ? {} : { limit }),
    };
  }
  if (input["action"] === "show") {
    return { action: "show", symbols: nonEmptyStrings(input["symbols"], "symbols") };
  }
  throw new TypeError('action must be either "find" or "show".');
}

function getStandardReference(): ApiReference {
  standardReference ??= createStandardApiReference();
  return standardReference;
}

function summarizeFind(results: readonly ApiReferenceFindTermResult[]): ApiQuerySummary {
  return {
    queryCount: results.length,
    resultCount: results.reduce((total, result) => total + result.matches.length, 0),
    foundCount: results.filter((result) => result.matches.length > 0).length,
    notFoundCount: results.filter((result) => result.matches.length === 0).length,
  };
}

function summarizeShow(results: readonly ApiReferenceShowResult[]): ApiQuerySummary {
  const notFoundCount = results.filter((result) => result.status === "not-found").length;
  return {
    queryCount: results.length,
    resultCount: results.length,
    foundCount: results.length - notFoundCount,
    notFoundCount,
  };
}

function createFailure(
  request: ApiQuery | null,
  results: readonly ApiQueryResult[],
  code: ApiQueryError["code"],
  message: string,
  summary: ApiQuerySummary = emptySummary(),
): ApiQueryFailure {
  return {
    schemaVersion: API_RESPONSE_SCHEMA_VERSION,
    ok: false,
    request,
    results,
    summary,
    error: { code, message },
  };
}

function emptySummary(): ApiQuerySummary {
  return { queryCount: 0, resultCount: 0, foundCount: 0, notFoundCount: 0 };
}

function nonEmptyStrings(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value)) throw new TypeError(`${field} must be an array of strings.`);
  const strings = value.map((item) => (typeof item === "string" ? item.trim() : ""));
  if (strings.some((item) => item.length === 0) || strings.length === 0) {
    throw new TypeError(`${field} must contain at least one non-empty string.`);
  }
  return strings;
}

function optionalUnit(value: unknown): ApiReferenceUnit | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string" && API_REFERENCE_UNITS.includes(value as ApiReferenceUnit)) {
    return value as ApiReferenceUnit;
  }
  throw new TypeError(`unit must be one of: ${API_REFERENCE_UNITS.join(", ")}.`);
}

function optionalPositiveInteger(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  throw new TypeError("limit must be a positive integer.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.length > 0 ? error.message : "Unknown error.";
}
