import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Outlet, useLocation, useMatch, useNavigate, useSearchParams } from "react-router-dom";
import { ApiError, deleteItem, listItems } from "../api/client";
import type { Item } from "../api/types";
import { libraryView, writeStoredView, type LibraryView } from "../lib/libraryView";
import { itemsKey, removeItem, savedLabel, type ItemCache } from "../lib/items";
import { ConfirmDialog } from "./ConfirmDialog";
import { ToastViewport, useToast } from "./Toasts";

export function LibraryPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [, setSearchParams] = useSearchParams();
  const panelOpen = useMatch({ path: "/items/:id", end: true });
  const queryClient = useQueryClient();
  const toast = useToast();
  const [pending, setPending] = useState<Item | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const view = libraryView(location.search);

  const query = useInfiniteQuery({
    queryKey: itemsKey,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => listItems(pageParam, signal),
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
  });

  const remove = useMutation({
    mutationFn: (item: Item) => deleteItem(item.id),
    onMutate: async (item) => {
      await queryClient.cancelQueries({ queryKey: itemsKey });
      const previous = queryClient.getQueryData<ItemCache>(itemsKey);
      queryClient.setQueryData<ItemCache>(itemsKey, (current) => removeItem(current, item.id));
      return { previous };
    },
    onSuccess: () => {
      toast.show("Removed", "success");
    },
    onError: (error, _item, context) => {
      const alreadyGone = error instanceof ApiError && error.status === 404;
      if (!alreadyGone && context?.previous) {
        queryClient.setQueryData(itemsKey, context.previous);
      }
      toast.show(
        alreadyGone ? "Already removed" : "Could not remove this swatch. It is still in your library.",
        "error",
      );
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: itemsKey });
    },
  });

  useEffect(() => {
    if (pending) return;
    const trigger = triggerRef.current;
    if (!trigger) return;
    triggerRef.current = null;
    if (trigger.isConnected) trigger.focus();
    else document.getElementById("main")?.focus();
  }, [pending]);

  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const activeId = items.some((item) => item.id === cursor) ? cursor : items[0]?.id;

  function choose(next: LibraryView) {
    writeStoredView(next);
    const params = new URLSearchParams(location.search);
    params.set("view", next);
    setSearchParams(params, { replace: true });
  }

  function openItem(id: number) {
    navigate({ pathname: `/items/${id}`, search: location.search });
  }

  function columnCount(): number {
    if (view === "list") return 1;
    const list = listRef.current;
    if (!list) return 1;
    const cards = [...list.querySelectorAll<HTMLElement>("[data-card]")];
    const first = cards[0];
    if (!first) return 1;
    const top = first.offsetTop;
    return Math.max(
      1,
      cards.filter((card) => card.offsetTop === top).length,
    );
  }

  function onCardKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const key = event.key;
    if (key !== "ArrowRight" && key !== "ArrowLeft" && key !== "ArrowDown" && key !== "ArrowUp") return;

    const columns = view === "list" ? 1 : columnCount();
    const delta =
      key === "ArrowRight" ? 1 : key === "ArrowLeft" ? -1 : key === "ArrowDown" ? columns : -columns;
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

  return (
    <div>
      <h1 className="font-display text-4xl">Your swatches</h1>
      <div role="group" aria-label="Library layout" className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          className="min-h-11 border border-ink px-4 py-2"
          aria-pressed={view === "grid"}
          onClick={() => choose("grid")}
        >
          Grid
        </button>
        <button
          type="button"
          className="min-h-11 border border-ink px-4 py-2"
          aria-pressed={view === "list"}
          onClick={() => choose("list")}
        >
          List
        </button>
      </div>

      {query.isPending ? <Skeleton /> : null}
      {query.isError ? (
        <div role="alert" className="mt-8">
          <p>Could not load your swatches.</p>
          <button type="button" className="mt-4 min-h-11 bg-ink px-4 py-2 text-canvas" onClick={() => query.refetch()}>
            Retry
          </button>
        </div>
      ) : null}
      {!query.isPending && !query.isError && items.length === 0 ? (
        <div className="mt-8">
          <h2 className="font-display text-2xl">Nothing saved yet</h2>
          <p className="mt-2">Save a link, a note, or a colour you want to remember.</p>
          <button type="button" className="mt-4 min-h-11 bg-ink px-4 py-2 text-canvas" onClick={() => navigate("/items/new")}>
            Add your first swatch
          </button>
        </div>
      ) : null}
      {!query.isPending && !query.isError && items.length > 0 ? (
        <>
          <ul ref={listRef} className={view === "grid" ? "mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2" : "mt-8 flex flex-col gap-2"}>
            {items.map((item, index) => (
              <li key={item.id} data-card className="border border-line bg-surface p-4" onClick={(event) => onCardClick(event, item.id)}>
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
                {item.color ? (
                  <p className="mt-3">
                    <span
                      className="inline-block size-4 border border-ink align-middle"
                      style={{ backgroundColor: item.color }}
                      aria-hidden="true"
                    />{" "}
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
                  <button type="button" className="min-h-11 underline" onClick={() => navigate(`/items/${item.id}/edit`)}>
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
            ))}
          </ul>
          {query.hasNextPage ? (
            <button
              type="button"
              className="mt-6 min-h-11 border border-ink px-4 py-2"
              onClick={() => query.fetchNextPage()}
              disabled={query.isFetchingNextPage}
            >
              {query.isFetchingNextPage ? "Loading more…" : "Load more"}
            </button>
          ) : null}
        </>
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
