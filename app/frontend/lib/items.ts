import type { Item, ItemInput } from "../api/types";

export const itemsKey = ["items"] as const;

export type ItemCache = {
  pages: { items: Item[]; next_cursor: string | null }[];
  pageParams: (string | null)[];
};

export function emptyItem(): ItemInput {
  return { title: "", source_url: "", notes: "", color: "" };
}

export function itemToInput(item: Item): ItemInput {
  return {
    title: item.title,
    source_url: item.source_url ?? "",
    notes: item.notes ?? "",
    color: item.color ?? "",
  };
}

export function normalizeUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.replace(/^([A-Za-z][A-Za-z0-9+.-]*:)/, (scheme) => scheme.toLowerCase());
}

export function normalizeColor(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.toUpperCase();
}

export function sourceDomain(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname || null;
  } catch {
    return null;
  }
}

export function validateItem(input: ItemInput): Record<string, string> {
  const errors: Record<string, string> = {};
  const title = input.title.trim();
  if (title.length === 0) errors.title = "can't be blank";
  else if ([...title].length > 120) errors.title = "is too long (maximum is 120 characters)";

  const notes = input.notes.trim();
  if ([...notes].length > 2000) errors.notes = "is too long (maximum is 2000 characters)";

  const source = normalizeUrl(input.source_url);
  if (source && source.length > 2048) {
    errors.source_url = "is too long (maximum is 2048 characters)";
  } else if (source && !isHttpUrl(source)) {
    errors.source_url = "must be an http or https URL";
  }

  const color = input.color.trim();
  if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
    errors.color = "must be a hex colour like #7C2D24";
  }

  return errors;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.length > 0;
  } catch {
    return false;
  }
}

export function savedLabel(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "Saved date unknown";

  const seconds = Math.round((then - now) / 1000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const divisions: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 60 * 60 * 24 * 365],
    ["month", 60 * 60 * 24 * 30],
    ["day", 60 * 60 * 24],
    ["hour", 60 * 60],
    ["minute", 60],
    ["second", 1],
  ];

  for (const [unit, amount] of divisions) {
    if (Math.abs(seconds) >= amount || unit === "second") {
      return `Saved ${formatter.format(Math.round(seconds / amount), unit)}`;
    }
  }

  return "Saved just now";
}

export function prependItem(data: ItemCache | undefined, item: Item): ItemCache {
  if (!data) {
    return { pages: [{ items: [item], next_cursor: null }], pageParams: [null] };
  }

  const [first, ...rest] = data.pages;
  if (!first) return { pages: [{ items: [item], next_cursor: null }], pageParams: data.pageParams };

  return {
    ...data,
    pages: [{ ...first, items: [item, ...first.items.filter((existing) => existing.id !== item.id)] }, ...rest],
  };
}

export function replaceItem(data: ItemCache | undefined, item: Item): ItemCache | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((existing) => (existing.id === item.id ? item : existing)),
    })),
  };
}

export function findCachedItem(data: ItemCache | undefined, id: number): Item | undefined {
  return data?.pages.flatMap((page) => page.items).find((item) => item.id === id);
}

export function removeItem(data: ItemCache | undefined, id: number): ItemCache | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.filter((existing) => existing.id !== id),
    })),
  };
}

export function optimisticItem(input: ItemInput, id = -Date.now()): Item {
  const source = normalizeUrl(input.source_url);
  const notes = input.notes.trim();
  return {
    id,
    title: input.title.trim(),
    source_url: source,
    source_domain: sourceDomain(source),
    notes: notes || null,
    color: normalizeColor(input.color),
    created_at: new Date().toISOString(),
  };
}
