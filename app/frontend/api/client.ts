import type { FieldErrors, Item, ItemInput, ItemPage } from "./types";

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

export function listItems(cursor: string | null, signal?: AbortSignal): Promise<ItemPage> {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  const query = params.toString();
  return request<ItemPage>(`/api/v1/items${query ? `?${query}` : ""}`, { signal });
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

export function updateItem(id: number, input: ItemInput, signal?: AbortSignal): Promise<Item> {
  return request<Item>(`/api/v1/items/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ item: input }),
    signal,
  });
}

export function deleteItem(id: number, signal?: AbortSignal): Promise<void> {
  return request<void>(`/api/v1/items/${id}`, { method: "DELETE", signal });
}
