import type { FieldErrors, Item, ItemInput, ItemPage, TagSummary } from "./types";

export class ApiError extends Error {
  readonly status: number;
  readonly fieldErrors: FieldErrors;

  constructor(status: number, fieldErrors: FieldErrors = {}, message = "Request failed") {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

function csrfToken(): string {
  return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? "";
}

// A page opened as http://name:password@host still has those credentials in
// its address. A relative fetch then throws in the browser. Build an
// absolute URL from the origin, which does not include the password.
function resolveUrl(path: string): string {
  const origin = window.location.origin;
  if (!origin || origin === "null") return path;
  return new URL(path, origin).href;
}

function readFieldErrors(value: unknown): FieldErrors {
  if (!value || typeof value !== "object") return {};

  const result: FieldErrors = {};
  for (const [key, messages] of Object.entries(value)) {
    if (Array.isArray(messages)) result[key] = messages.map(String);
    else if (typeof messages === "string") result[key] = [messages];
  }
  return result;
}

async function parseError(response: Response): Promise<ApiError> {
  let fieldErrors: FieldErrors = {};
  let message = "Request failed";

  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object") {
      if ("errors" in body) fieldErrors = readFieldErrors(body.errors);
      const first = Object.values(fieldErrors).flat()[0];
      if (first) message = first;
      if ("error" in body && typeof body.error === "string") message = body.error;
    }
  } catch {
    message = "Request failed";
  }

  return new ApiError(response.status, fieldErrors, message);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body) {
    headers.set("Content-Type", "application/json");
    headers.set("X-CSRF-Token", csrfToken());
  } else if (init.method && init.method !== "GET" && init.method !== "HEAD") {
    headers.set("X-CSRF-Token", csrfToken());
  }

  const response = await fetch(resolveUrl(path), {
    ...init,
    headers,
    credentials: "include",
  });

  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function listItems(
  cursor: string | null,
  options: { q?: string; tags?: string[]; sort?: string; signal?: AbortSignal } = {},
): Promise<ItemPage> {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  if (options.q) params.set("q", options.q);
  for (const tag of options.tags ?? []) params.append("tags[]", tag);
  if (options.sort && options.sort !== "newest") params.set("sort", options.sort);
  const query = params.toString();
  return request<ItemPage>(`/api/v1/items${query ? `?${query}` : ""}`, { signal: options.signal });
}

export async function listTags(signal?: AbortSignal): Promise<TagSummary[]> {
  const body = await request<unknown>("/api/v1/tags", { signal });
  if (!Array.isArray(body)) return [];
  return body.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const record = row as { id?: unknown; name?: unknown; items_count?: unknown };
    if (typeof record.id !== "number" || typeof record.name !== "string") return [];
    const itemsCount = typeof record.items_count === "number" ? record.items_count : 0;
    return [{ id: record.id, name: record.name, items_count: itemsCount }];
  });
}

export function updateTag(id: number, name: string, signal?: AbortSignal): Promise<TagSummary> {
  return request<TagSummary>(`/api/v1/tags/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ tag: { name } }),
    signal,
  });
}

export function deleteTag(id: number, signal?: AbortSignal): Promise<void> {
  return request<void>(`/api/v1/tags/${id}`, { method: "DELETE", signal });
}

export function getItem(id: string, signal?: AbortSignal): Promise<Item> {
  return request<Item>(`/api/v1/items/${id}`, { signal });
}

export function createItem(input: ItemInput, signal?: AbortSignal): Promise<Item> {
  return request<Item>("/api/v1/items", {
    method: "POST",
    body: JSON.stringify({ item: input }),
    signal,
  });
}

export function updateItem(id: number, input: Partial<ItemInput>, signal?: AbortSignal): Promise<Item> {
  return request<Item>(`/api/v1/items/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ item: input }),
    signal,
  });
}

export function deleteItem(id: number, signal?: AbortSignal): Promise<void> {
  return request<void>(`/api/v1/items/${id}`, { method: "DELETE", signal });
}
