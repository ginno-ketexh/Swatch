import { useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, deleteItem, listItems } from "../api/client";
import type { Item } from "../api/types";
import { itemsKey, removeItem, savedLabel, type ItemCache } from "../lib/items";
import { ConfirmDialog } from "./ConfirmDialog";

export function LibraryPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<Item | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const noticeRef = useRef<HTMLParagraphElement>(null);

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
    onError: (error, _item, context) => {
      const alreadyGone = error instanceof ApiError && error.status === 404;
      if (!alreadyGone && context?.previous) {
        queryClient.setQueryData(itemsKey, context.previous);
      }
      setNotice(alreadyGone ? "Already removed" : "Could not remove this swatch. It is still in your library.");
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: itemsKey });
    },
  });

  useEffect(() => {
    if (notice) noticeRef.current?.focus();
  }, [notice]);

  useEffect(() => {
    if (pending) return;
    const trigger = triggerRef.current;
    if (!trigger) return;
    triggerRef.current = null;
    if (notice) return;
    if (trigger.isConnected) trigger.focus();
    else document.getElementById("main")?.focus();
  }, [pending, notice]);

  const items = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div>
      <h1 className="font-display text-4xl">Your swatches</h1>
      {notice ? (
        <p ref={noticeRef} tabIndex={-1} role="alert" id="library-notice" className="mt-4 border border-accent px-3 py-2">
          {notice}
        </p>
      ) : null}

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
          <button
            type="button"
            className="mt-4 min-h-11 bg-ink px-4 py-2 text-canvas"
            onClick={() => navigate("/items/new")}
          >
            Add your first swatch
          </button>
        </div>
      ) : null}
      {!query.isPending && !query.isError && items.length > 0 ? (
        <>
          <ul className="mt-8 flex flex-col gap-4">
            {items.map((item) => (
              <li key={item.id} className="border border-line bg-surface p-4">
                <h2 className="break-words font-display text-2xl">{item.title}</h2>
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
                {item.notes ? <p className="mt-3 break-words whitespace-pre-wrap">{item.notes}</p> : null}
                <div className="mt-4 flex flex-wrap gap-3">
                  <button type="button" className="min-h-11 underline" onClick={() => navigate(`/items/${item.id}/edit`)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="min-h-11 underline"
                    onClick={(event) => {
                      triggerRef.current = event.currentTarget;
                      setNotice(null);
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
