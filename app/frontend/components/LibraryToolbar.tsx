import { useQuery } from "@tanstack/react-query";
import { useRef, useState, type KeyboardEvent } from "react";
import { listTags } from "../api/client";
import type { LibraryFilters, SortMode } from "../lib/filters";
import { summaryText } from "../lib/filters";
import type { LibraryView } from "../lib/libraryView";

type LibraryToolbarProps = {
  draft: string;
  onDraft: (value: string) => void;
  onClearSearch: () => void;
  filters: LibraryFilters;
  onFilters: (patch: Partial<LibraryFilters>) => void;
  onClearFilters: () => void;
  notice: string | null;
  onNotice: (message: string | null) => void;
  total: number | null;
  updating: boolean;
  view: LibraryView;
  onView: (view: LibraryView) => void;
};

export function LibraryToolbar({
  draft,
  onDraft,
  onClearSearch,
  filters,
  onFilters,
  onClearFilters,
  notice,
  onNotice,
  total,
  updating,
  view,
  onView,
}: LibraryToolbarProps) {
  const [open, setOpen] = useState(false);
  const [tagQuery, setTagQuery] = useState("");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tags = useQuery({
    queryKey: ["tags"],
    queryFn: ({ signal }) => listTags(signal),
  });

  const usable = (tags.data ?? []).filter((tag) => tag.items_count > 0);
  const noTags = tags.isSuccess && usable.length === 0;
  const showTagSearch = usable.length > 12;
  const visible = usable.filter((tag) => tag.name.toLowerCase().includes(tagQuery.trim().toLowerCase()));

  function toggle(name: string, selected: boolean) {
    if (!selected && filters.tags.length >= 5) {
      onNotice("You can filter by at most 5 tags.");
      return;
    }
    const next = selected ? filters.tags.filter((tag) => tag !== name) : [...filters.tags, name];
    onNotice(null);
    onFilters({ tags: next });
  }

  function onPanelKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    setOpen(false);
    buttonRef.current?.focus();
  }

  return (
    <div className="mt-6 flex min-w-0 flex-col gap-4">
      <div>
        <label className="block" htmlFor="swatch-search">
          Search swatches
        </label>
        <p id="swatch-search-help" className="mt-1 text-muted">
          Search titles, notes, links, and colours. Up to 100 characters.
        </p>
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
          <input
            id="swatch-search"
            className="min-w-0 w-full flex-1 border border-ink bg-canvas px-3 py-2 text-base sm:max-w-md"
            type="search"
            value={draft}
            maxLength={100}
            autoComplete="off"
            aria-describedby="swatch-search-help"
            onChange={(event) => onDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && draft.length > 0) {
                event.preventDefault();
                onClearSearch();
              }
            }}
          />
          {draft.length > 0 ? (
            <button type="button" className="min-h-11 underline" onClick={onClearSearch}>
              Clear search
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex min-w-0 flex-wrap items-end gap-3">
        <div>
          <button
            ref={buttonRef}
            type="button"
            className="min-h-11 border border-ink px-4 py-2"
            aria-expanded={open}
            aria-controls="tag-filter-panel"
            onClick={() => setOpen((current) => !current)}
          >
            {noTags ? "No tags yet" : "Filter by tag"}
          </button>
        </div>
        <div>
          <label className="block" htmlFor="swatch-sort">
            Sort by
          </label>
          <select
            id="swatch-sort"
            className="mt-1 min-h-11 max-w-full border border-ink bg-canvas px-3 py-2 text-base"
            value={filters.sort}
            onChange={(event) => onFilters({ sort: event.target.value as SortMode })}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="az">Title A–Z</option>
          </select>
        </div>
        <div role="group" aria-label="Library layout" className="flex flex-wrap gap-2">
          <button type="button" className="min-h-11 border border-ink px-4 py-2" aria-pressed={view === "grid"} onClick={() => onView("grid")}>
            Grid
          </button>
          <button type="button" className="min-h-11 border border-ink px-4 py-2" aria-pressed={view === "list"} onClick={() => onView("list")}>
            List
          </button>
        </div>
      </div>

      {open ? (
        <div id="tag-filter-panel" className="border border-line bg-surface p-3" onKeyDown={onPanelKeyDown}>
          {noTags ? <p>Add tags from any swatch.</p> : null}
          {tags.isPending ? <p>Loading tags…</p> : null}
          {tags.isError ? (
            <div role="alert">
              <p>Could not load tags.</p>
              <button type="button" className="mt-2 min-h-11 underline" onClick={() => tags.refetch()}>
                Retry
              </button>
            </div>
          ) : null}
          {usable.length > 0 ? (
            <fieldset>
              <legend>Tags</legend>
              {showTagSearch ? (
                <div className="mt-2">
                  <label className="block" htmlFor="tag-filter-find">
                    Find a tag
                  </label>
                  <input
                    id="tag-filter-find"
                    className="mt-1 w-full border border-ink bg-canvas px-3 py-2 text-base"
                    value={tagQuery}
                    onChange={(event) => setTagQuery(event.target.value)}
                  />
                </div>
              ) : null}
              <ul className="mt-2 flex flex-col gap-2">
                {visible.map((tag) => {
                  const selected = filters.tags.includes(tag.name.toLowerCase());
                  return (
                    <li key={tag.id}>
                      <label className="inline-flex min-h-6 items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggle(tag.name.toLowerCase(), selected)}
                        />
                        {tag.name} ({tag.items_count})
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          ) : null}
        </div>
      ) : null}

      {notice ? <p>{notice}</p> : null}

      {filters.tags.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {filters.tags.map((tag) => (
            <button key={tag} type="button" className="min-h-6 border border-ink px-2 py-1" aria-label={`Remove filter ${tag}`} onClick={() => toggle(tag, true)}>
              {tag}
            </button>
          ))}
          <button type="button" className="min-h-11 underline" onClick={onClearFilters}>
            Clear all filters
          </button>
        </div>
      ) : null}

      {total !== null ? <p>{summaryText(total, filters)}</p> : null}
      {updating ? <p role="status">Updating results…</p> : null}
    </div>
  );
}
