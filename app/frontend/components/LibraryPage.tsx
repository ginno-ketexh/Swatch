import { keepPreviousData, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Outlet, useLocation, useMatch, useNavigate } from "react-router-dom";
import { ApiError, deleteItem, listItems } from "../api/client";
import type { Item } from "../api/types";
import { collapseQuery, readFilters, withFilters, type LibraryFilters } from "../lib/filters";
import { libraryView, writeStoredView, type LibraryView } from "../lib/libraryView";
import { itemsKey, removeItem, restoreItemCaches, savedLabel, snapshotItemCaches, updateItemCaches } from "../lib/items";
import { ConfirmDialog } from "./ConfirmDialog";
import { CoverImage } from "./CoverImage";
import { LibraryToolbar } from "./LibraryToolbar";
import { ToastViewport, useToast } from "./Toasts";

export function LibraryPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const panelOpen = useMatch({ path: "/items/:id", end: true });
  const queryClient = useQueryClient();
  const { show } = useToast();
  const filters = useMemo(() => readFilters(location.search), [location.search]);
  const [draft, setDraft] = useState(filters.q);
  const [trackedQuery, setTrackedQuery] = useState(filters.q);
  const [filterNotice, setFilterNotice] = useState<string | null>(null);
  const [announced, setAnnounced] = useState("");
  const [kept, setKept] = useState<{ items: Item[]; total: number } | null>(null);
  const [pending, setPending] = useState<Item | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const handledIgnored = useRef("");
  const view = libraryView(location.search);

  if (filters.q !== trackedQuery) {
    setTrackedQuery(filters.q);
    setDraft(filters.q);
  }

  const replaceFilters = useCallback(
    (patch: Partial<LibraryFilters>) => {
      navigate({ pathname: location.pathname, search: withFilters(location.search, patch) }, { replace: true });
    },
    [location.pathname, location.search, navigate],
  );

  useEffect(() => {
    const collapsed = collapseQuery(draft);
    if (collapsed === filters.q) return;
    const timer = window.setTimeout(() => replaceFilters({ q: collapsed }), 300);
    return () => window.clearTimeout(timer);
  }, [draft, filters.q, replaceFilters]);

  const query = useInfiniteQuery({
    queryKey: [...itemsKey, { q: filters.q, tags: filters.tags, sort: filters.sort }],
    initialPageParam: null as string | null,
    placeholderData: keepPreviousData,
    queryFn: ({ pageParam, signal }) => listItems(pageParam, { q: filters.q, tags: filters.tags, sort: filters.sort, signal }),
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
  });

  const remove = useMutation({
    mutationFn: (item: Item) => deleteItem(item.id),
    onMutate: async (item) => {
      await queryClient.cancelQueries({ queryKey: itemsKey });
      const previous = snapshotItemCaches(queryClient);
      updateItemCaches(queryClient, (current) => removeItem(current, item.id));
      return { previous };
    },
    onSuccess: () => {
      show("Removed", "success");
    },
    onError: (error, _item, context) => {
      const alreadyGone = error instanceof ApiError && error.status === 404;
      if (!alreadyGone && context?.previous) restoreItemCaches(queryClient, context.previous);
      show(alreadyGone ? "Already removed" : "Could not remove this swatch. It is still in your library.", "error");
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: itemsKey });
    },
  });

  const ignoredKey =
    query.data && !query.isPlaceholderData ? (query.data.pages[0]?.ignored_tags ?? []).join("\n") : "";
  useEffect(() => {
    if (!ignoredKey || handledIgnored.current === ignoredKey) return;
    handledIgnored.current = ignoredKey;
    const names = ignoredKey.split("\n");
    const next = filters.tags.filter((tag) => !names.includes(tag));
    if (next.length !== filters.tags.length) replaceFilters({ tags: next });
    show(names.map((name) => `Tag “${name}” no longer exists, so it was removed from the filter`).join(" "), "success");
  }, [ignoredKey, filters.tags, replaceFilters, show]);

  useEffect(() => {
    if (pending) return;
    const trigger = triggerRef.current;
    if (!trigger) return;
    triggerRef.current = null;
    if (trigger.isConnected) trigger.focus();
    else document.getElementById("main")?.focus();
  }, [pending]);

  const rateLimited = query.isError && query.error instanceof ApiError && query.error.status === 429;
  const loaded = query.data?.pages.flatMap((page) => page.items) ?? [];
  const loadedTotal = query.data?.pages[0]?.total_count ?? loaded.length;
  if (query.data && !query.isPlaceholderData && !query.isError) {
    const signature = `${loadedTotal}:${loaded.map((item) => item.id).join(",")}`;
    const keptSignature = kept ? `${kept.total}:${kept.items.map((item) => item.id).join(",")}` : "";
    if (signature !== keptSignature) setKept({ items: loaded, total: loadedTotal });
  }
  const items = loaded.length > 0 || !rateLimited ? loaded : (kept?.items ?? []);
  const total = query.data ? loadedTotal : rateLimited ? (kept?.total ?? items.length) : items.length;
  const filtering = filters.q.length > 0 || filters.tags.length > 0;
  const updating = query.isFetching && !query.isFetchingNextPage && query.isPlaceholderData;
  const showSkeleton = query.isPending && !query.data;
  const showError = query.isError && items.length === 0;
  const showEmpty = !showSkeleton && !query.isError && !filtering && items.length === 0;
  const showNoResults = !showSkeleton && !query.isError && filtering && items.length === 0 && !query.isPlaceholderData;
  const countText =
    query.isPending || query.isFetching || query.isPlaceholderData || query.isError
      ? ""
      : total === 0 && filtering
        ? "No swatches match"
        : total === 1
          ? "1 swatch matches"
          : total > 1
            ? `${total} swatches match`
            : "";
  if (countText && countText !== announced) setAnnounced(countText);

  function choose(next: LibraryView) {
    writeStoredView(next);
    navigate({ pathname: location.pathname, search: withFilters(location.search, { view: next }) }, { replace: true });
  }

  function clearSearch() {
    setDraft("");
    replaceFilters({ q: "" });
    document.getElementById("swatch-search")?.focus();
  }

  function clearFilters() {
    setDraft("");
    setFilterNotice(null);
    navigate(
      { pathname: location.pathname, search: withFilters(location.search, { q: "", tags: [], sort: "newest" }) },
      { replace: true },
    );
    document.getElementById("swatch-search")?.focus();
  }

  function addTagFilter(name: string) {
    const key = name.toLowerCase();
    if (filters.tags.includes(key)) return;
    if (filters.tags.length >= 5) {
      setFilterNotice("You can filter by at most 5 tags.");
      return;
    }
    setFilterNotice(null);
    replaceFilters({ tags: [...filters.tags, key] });
  }

  function openItem(id: number) {
    navigate({ pathname: `/items/${id}`, search: location.search });
  }

  function eagerCover(view: LibraryView, index: number): boolean {
    if (view === "list") return index === 0;
    const wide = typeof window.matchMedia === "function" && window.matchMedia("(min-width: 40rem)").matches;
    return index < (wide ? 2 : 1);
  }

  function columnCount(): number {
    if (view === "list") return 1;
    const list = listRef.current;
    if (!list) return 1;
    const cards = [...list.querySelectorAll<HTMLElement>("[data-card]")];
    const first = cards[0];
    if (!first) return 1;
    const top = first.offsetTop;
    return Math.max(1, cards.filter((card) => card.offsetTop === top).length);
  }

  function onCardKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const key = event.key;
    if (key !== "ArrowRight" && key !== "ArrowLeft" && key !== "ArrowDown" && key !== "ArrowUp") return;

    const columns = view === "list" ? 1 : columnCount();
    const delta = key === "ArrowRight" ? 1 : key === "ArrowLeft" ? -1 : key === "ArrowDown" ? columns : -columns;
    const next = index + delta;
    event.preventDefault();
    if (next < 0 || next >= items.length) return;

    const nextItem = items[next];
    if (!nextItem) return;
    setCursor(nextItem.id);
    document.getElementById(`swatch-card-${nextItem.id}`)?.focus();
  }

  function onCardClick(event: MouseEvent<HTMLLIElement>, id: number) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.closest("a, button")) return;
    openItem(id);
  }

  const activeId = items.some((item) => item.id === cursor) ? cursor : items[0]?.id;
  const noResultTerm = filters.q || filters.tags.join(" + ");

  return (
    <div className="min-w-0">
      <h1 className="font-display text-4xl">Your swatches</h1>
      <LibraryToolbar
        draft={draft}
        onDraft={setDraft}
        onClearSearch={clearSearch}
        filters={filters}
        onFilters={(patch) => {
          setFilterNotice(null);
          replaceFilters(patch);
        }}
        onClearFilters={clearFilters}
        notice={filterNotice}
        onNotice={setFilterNotice}
        total={showSkeleton || showEmpty ? null : total}
        updating={updating}
        view={view}
        onView={choose}
      />

      {showSkeleton ? <Skeleton /> : null}
      {rateLimited && items.length > 0 ? (
        <p role="alert" className="mt-6">
          Searching too fast, try again in a moment
        </p>
      ) : null}
      {showError ? (
        <div role="alert" className="mt-8">
          <p>{rateLimited ? "Searching too fast, try again in a moment" : "Could not load your swatches."}</p>
          <button type="button" className="mt-4 min-h-11 bg-ink px-4 py-2 text-canvas" onClick={() => query.refetch()}>
            Retry
          </button>
        </div>
      ) : null}
      {showEmpty ? (
        <div className="mt-8">
          <h2 className="font-display text-2xl">Nothing saved yet</h2>
          <p className="mt-2">Save a link, a note, or a colour you want to remember.</p>
          <button type="button" className="mt-4 min-h-11 bg-ink px-4 py-2 text-canvas" onClick={() => navigate("/items/new")}>
            Add your first swatch
          </button>
        </div>
      ) : null}
      {showNoResults ? (
        <div className="mt-8">
          <h2 className="font-display text-2xl">No swatches match “{noResultTerm}”</h2>
          {filters.q && filters.tags.length > 0 ? <p className="mt-2">Tagged {filters.tags.join(" + ")}.</p> : null}
          <button type="button" className="mt-4 min-h-11 bg-ink px-4 py-2 text-canvas" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      ) : null}
      {!showSkeleton && !showError && items.length > 0 ? (
        <>
          <ul ref={listRef} className={view === "grid" ? "mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2" : "mt-8 flex flex-col gap-2"}>
            {items.map((item, index) => {
              const names = item.tags ?? [];
              const shown = names.slice(0, 3);
              const extra = names.length - shown.length;
              return (
                <li key={item.id} data-card className="min-w-0 border border-line bg-surface p-4" onClick={(event) => onCardClick(event, item.id)}>
                  <CoverImage item={item} view={view} eager={eagerCover(view, index)} />
                  <h2 className="break-words font-display text-2xl">
                    <button
                      id={`swatch-card-${item.id}`}
                      type="button"
                      className="text-left font-display text-2xl"
                      tabIndex={item.id === activeId ? 0 : -1}
                      onClick={() => openItem(item.id)}
                      onKeyDown={(event) => onCardKeyDown(event, index)}
                    >
                      {item.title}
                    </button>
                  </h2>
                  {shown.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {shown.map((tag) => (
                        <button
                          key={tag.id}
                          type="button"
                          className="min-h-6 border border-line px-2 py-1"
                          onClick={() => addTagFilter(tag.name)}
                        >
                          Filter by tag {tag.name}
                        </button>
                      ))}
                      {extra > 0 ? <span>+{extra} more</span> : null}
                    </div>
                  ) : null}
                  {item.color ? (
                    <p className="mt-3">
                      <span className="inline-block size-4 border border-ink align-middle" style={{ backgroundColor: item.color }} aria-hidden="true" />{" "}
                      <span>{item.color}</span>
                    </p>
                  ) : (
                    <p className="mt-3">No colour</p>
                  )}
                  {item.source_url ? (
                    <p className="mt-2 break-words">
                      <a href={item.source_url} target="_blank" rel="noopener noreferrer">
                        {item.source_domain ?? item.source_url}
                        <span> (opens in a new tab)</span>
                      </a>
                    </p>
                  ) : (
                    <p className="mt-2">No source link</p>
                  )}
                  <p className="mt-2 text-muted">{savedLabel(item.created_at)}</p>
                  {view === "grid" && item.notes ? <p className="mt-3 break-words whitespace-pre-wrap">{item.notes}</p> : null}
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button type="button" className="min-h-11 underline" onClick={() => navigate({ pathname: `/items/${item.id}/edit`, search: location.search })}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="min-h-11 underline"
                      onClick={(event) => {
                        triggerRef.current = event.currentTarget;
                        setPending(item);
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          {query.hasNextPage ? (
            <button type="button" className="mt-6 min-h-11 border border-ink px-4 py-2" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
              {query.isFetchingNextPage ? "Loading more…" : "Load more"}
            </button>
          ) : null}
        </>
      ) : null}

      {!updating && announced ? (
        <p aria-live="polite" className="sr-only">
          {announced}
        </p>
      ) : null}

      {panelOpen ? null : <ToastViewport />}
      <Outlet />

      <ConfirmDialog
        open={pending !== null}
        title="Remove this swatch?"
        description={pending ? `This takes “${pending.title}” out of your library.` : ""}
        confirmLabel="Remove swatch"
        cancelLabel="Cancel"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          const item = pending;
          setPending(null);
          if (item) remove.mutate(item);
        }}
      />
    </div>
  );
}

function Skeleton() {
  return (
    <div className="mt-8" role="status" aria-busy="true">
      <p className="sr-only">Loading swatches</p>
      <ul aria-hidden="true" className="flex flex-col gap-4">
        {Array.from({ length: 6 }, (_, index) => (
          <li key={index} className="skeleton h-28 border border-line" />
        ))}
      </ul>
    </div>
  );
}
