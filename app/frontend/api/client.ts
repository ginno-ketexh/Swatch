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

export function csrfToken(): string {
  return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? "";
}

export const navigation = {
  assign(url: string) {
    window.location.assign(url);
  },
};

export function signInPath(returnTo: string): string {
  return `/sign-in?return_to=${encodeURIComponent(returnTo)}`;
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

  const method = (init.method ?? "GET").toUpperCase();
  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "include",
  });

  if (response.status === 401) {
    if (method === "GET" || method === "HEAD") {
      navigation.assign(signInPath(`${window.location.pathname}${window.location.search}`));
    } else {
      window.dispatchEvent(new Event("swatch:signed-out"));
    }
  }

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

export function updateImageAlt(id: number, alt: string): Promise<Item> {
  return request<Item>(`/api/v1/items/${id}/image`, {
    method: "PATCH",
    body: JSON.stringify({ alt }),
  });
}

export function deleteItemImage(id: number): Promise<void> {
  return request<void>(`/api/v1/items/${id}/image`, { method: "DELETE" });
}

export function uploadItemImage(
  itemId: number,
  file: File,
  alt: string,
  onProgress: (percent: number) => void,
  signal: AbortSignal,
): Promise<Item> {
  return new Promise((resolve, reject) => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      reject(new ApiError(0, {}, "You're offline"));
      return;
    }

    const body = new FormData();
    body.append("image", file);
    body.append("alt", alt);
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `/api/v1/items/${itemId}/image`);
    xhr.setRequestHeader("Accept", "application/json");
    xhr.setRequestHeader("X-CSRF-Token", csrfToken());
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total === 0) return;
      onProgress(Math.round((event.loaded / event.total) * 100));
    };
    const abort = () => xhr.abort();
    signal.addEventListener("abort", abort);
    xhr.onload = () => {
      signal.removeEventListener("abort", abort);
      const response = new Response(xhr.responseText, { status: xhr.status, headers: { "Content-Type": "application/json" } });
      if (xhr.status === 401) window.dispatchEvent(new Event("swatch:signed-out"));
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText) as Item);
        return;
      }
      parseError(response).then(reject, reject);
    };
    xhr.onerror = () => {
      signal.removeEventListener("abort", abort);
      reject(new ApiError(0, {}, "The image could not be uploaded. Check your connection and try again."));
    };
    xhr.onabort = () => {
      signal.removeEventListener("abort", abort);
      reject(new ApiError(0, {}, "Upload cancelled"));
    };
    xhr.send(body);
  });
}
