import { executeApiQuery, formatApiQueryResponse, type ApiQuery } from "./core.js";

const form = requiredElement<HTMLFormElement>("query-form");
const action = requiredElement<HTMLSelectElement>("action");
const query = requiredElement<HTMLTextAreaElement>("query");
const unit = requiredElement<HTMLSelectElement>("unit");
const limit = requiredElement<HTMLInputElement>("limit");
const output = requiredElement<HTMLElement>("output");
const status = requiredElement<HTMLElement>("status");

action.addEventListener("change", updateControls);
form.addEventListener("submit", (event) => {
  event.preventDefault();
  const request = browserQuery();
  const response = executeApiQuery(request);
  output.textContent = formatApiQueryResponse(response);
  status.textContent = response.ok
    ? `${response.summary.resultCount} result(s)`
    : response.error.message;
  status.dataset["ok"] = String(response.ok);
});

updateControls();
form.requestSubmit();

function browserQuery(): ApiQuery {
  const values = query.value
    .split(/\n/u)
    .map((value) => value.trim())
    .filter(Boolean);
  if (action.value === "show") return { action: "show", symbols: values };
  return {
    action: "find",
    terms: values,
    ...(unit.value === "" ? {} : { unit: unit.value as "sheet" }),
    ...(limit.value === "" ? {} : { limit: Number(limit.value) }),
  };
}

function updateControls(): void {
  const finding = action.value === "find";
  unit.disabled = !finding;
  limit.disabled = !finding;
  query.value = finding ? "setValues" : "FRange.setValues";
  query.placeholder = finding ? "One search term per line" : "One exact symbol per line";
}

function requiredElement<T extends Element>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`Missing #${id}.`);
  return element as unknown as T;
}
