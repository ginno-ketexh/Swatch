export type SortMode = "newest" | "oldest" | "az";

export type LibraryFilters = {
  q: string;
  tags: string[];
  sort: SortMode;
};

const SORTS: SortMode[] = ["newest", "oldest", "az"];

export function collapseQuery(value: string): string {
  return value.normalize("NFC").replace(/\p{Cc}/gu, "").trim().replace(/\s+/g, " ").slice(0, 100);
}

function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const tag of tags) {
    const name = tag.trim().toLowerCase();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    next.push(name);
    if (next.length === 5) break;
  }
  return next;
}

export function readFilters(search: string): LibraryFilters {
  const params = new URLSearchParams(search);
  const sortRaw = params.get("sort");
  const sort: SortMode = SORTS.includes(sortRaw as SortMode) ? (sortRaw as SortMode) : "newest";
  const tags = (params.get("tags") ?? "")
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
  return {
    q: collapseQuery(params.get("q") ?? ""),
    tags: normalizeTags(tags),
    sort,
  };
}

// Build the query by hand so a space stays %20 and a comma between tag
// names stays a comma. URLSearchParams would encode that comma as %2C.
export function withFilters(search: string, patch: Partial<LibraryFilters> & { view?: "grid" | "list" | null }): string {
  const current = readFilters(search);
  const next: LibraryFilters = {
    q: patch.q !== undefined ? collapseQuery(patch.q) : current.q,
    tags: patch.tags !== undefined ? normalizeTags(patch.tags) : current.tags,
    sort: patch.sort ?? current.sort,
  };
  const params = new URLSearchParams(search);
  const view = patch.view === undefined ? params.get("view") : patch.view;
  const parts: string[] = [];
  if (next.q) parts.push(`q=${encodeURIComponent(next.q)}`);
  if (next.tags.length > 0) parts.push(`tags=${next.tags.map((tag) => encodeURIComponent(tag)).join(",")}`);
  if (next.sort !== "newest") parts.push(`sort=${next.sort}`);
  if (view === "grid" || view === "list") parts.push(`view=${view}`);
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

export function sortLabel(sort: SortMode): string | null {
  if (sort === "oldest") return "Oldest first";
  if (sort === "az") return "Title A–Z";
  return null;
}

export function summaryText(total: number, filters: LibraryFilters): string {
  const bits = [`${total} ${total === 1 ? "swatch" : "swatches"}`];
  if (filters.q) bits.push(`matching “${filters.q}”`);
  if (filters.tags.length > 0) bits.push(`tagged ${filters.tags.join(" + ")}`);
  const sort = sortLabel(filters.sort);
  if (sort) bits.push(sort);
  return bits.join(" · ");
}
