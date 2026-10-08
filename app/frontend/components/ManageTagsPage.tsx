import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ApiError, deleteTag, listTags, updateTag } from "../api/client";
import type { TagSummary } from "../api/types";
import { readFilters, withFilters } from "../lib/filters";
import { itemsKey, snapshotItemCaches, restoreItemCaches, updateItemCaches, type ItemCache } from "../lib/items";
import { ConfirmDialog } from "./ConfirmDialog";
import { ToastViewport, useToast } from "./Toasts";

function renameInCache(data: ItemCache | undefined, id: number, name: string): ItemCache | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((item) => ({
        ...item,
        tags: (item.tags ?? []).map((tag) => (tag.id === id ? { ...tag, name } : tag)),
      })),
    })),
  };
}

function dropFromCache(data: ItemCache | undefined, id: number): ItemCache | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((item) => ({
        ...item,
        tags: (item.tags ?? []).filter((tag) => tag.id !== id),
      })),
    })),
  };
}

export function ManageTagsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [pending, setPending] = useState<TagSummary | null>(null);
  const returnFocusId = useRef<number | null>(null);
  const deleteTrigger = useRef<HTMLButtonElement | null>(null);

  const query = useQuery({
    queryKey: ["tags"],
    queryFn: ({ signal }) => listTags(signal),
  });

  useEffect(() => {
    if (editingId !== null) return;
    const id = returnFocusId.current;
    if (id === null) return;
    returnFocusId.current = null;
    document.getElementById(`rename-tag-${id}`)?.focus();
  }, [editingId]);

  useEffect(() => {
    if (pending) return;
    const trigger = deleteTrigger.current;
    if (!trigger) return;
    deleteTrigger.current = null;
    if (trigger.isConnected) trigger.focus();
    else document.getElementById("main")?.focus();
  }, [pending]);

  function rewriteFilter(from: string, to: string | null) {
    const filters = readFilters(location.search);
    if (!filters.tags.includes(from)) return;
    const tags = to ? filters.tags.map((tag) => (tag === from ? to : tag)) : filters.tags.filter((tag) => tag !== from);
    navigate({ pathname: location.pathname, search: withFilters(location.search, { tags }) }, { replace: true });
  }

  const rename = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string; previous: string }) => updateTag(id, name),
    onMutate: async ({ id, name }) => {
      await queryClient.cancelQueries({ queryKey: ["tags"] });
      await queryClient.cancelQueries({ queryKey: itemsKey });
      const previousTags = queryClient.getQueryData<TagSummary[]>(["tags"]);
      const previousItems = snapshotItemCaches(queryClient);
      queryClient.setQueryData<TagSummary[]>(["tags"], (current) =>
        current
          ?.map((tag) => (tag.id === id ? { ...tag, name } : tag))
          .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())),
      );
      updateItemCaches(queryClient, (current) => renameInCache(current, id, name));
      return { previousTags, previousItems };
    },
    onError: (error, _variables, context) => {
      if (context?.previousTags) queryClient.setQueryData(["tags"], context.previousTags);
      if (context?.previousItems) restoreItemCaches(queryClient, context.previousItems);
      const message = error instanceof ApiError ? error.message : "Could not rename this tag.";
      setFieldError(message);
      toast.show(message, "error");
    },
    onSuccess: (saved, variables) => {
      setFieldError(null);
      setEditingId(null);
      rewriteFilter(variables.previous.toLowerCase(), saved.name.toLowerCase());
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tags"] });
      await queryClient.invalidateQueries({ queryKey: itemsKey });
      await queryClient.invalidateQueries({ queryKey: ["item"] });
    },
  });

  const remove = useMutation({
    mutationFn: (tag: TagSummary) => deleteTag(tag.id),
    onMutate: async (tag) => {
      await queryClient.cancelQueries({ queryKey: ["tags"] });
      await queryClient.cancelQueries({ queryKey: itemsKey });
      const previousTags = queryClient.getQueryData<TagSummary[]>(["tags"]);
      const previousItems = snapshotItemCaches(queryClient);
      queryClient.setQueryData<TagSummary[]>(["tags"], (current) => current?.filter((row) => row.id !== tag.id));
      updateItemCaches(queryClient, (current) => dropFromCache(current, tag.id));
      return { previousTags, previousItems };
    },
    onError: (error, tag, context) => {
      const alreadyGone = error instanceof ApiError && error.status === 404;
      if (!alreadyGone) {
        if (context?.previousTags) queryClient.setQueryData(["tags"], context.previousTags);
        if (context?.previousItems) restoreItemCaches(queryClient, context.previousItems);
      }
      toast.show(alreadyGone ? "Already deleted" : "Could not delete this tag.", "error");
      if (alreadyGone) rewriteFilter(tag.name.toLowerCase(), null);
    },
    onSuccess: (_result, tag) => {
      rewriteFilter(tag.name.toLowerCase(), null);
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tags"] });
      await queryClient.invalidateQueries({ queryKey: itemsKey });
    },
  });

  const rows = query.data ?? [];

  return (
    <div>
      <h1 className="font-display text-4xl">Manage tags</h1>
      <p className="mt-3">
        <Link className="underline" to={{ pathname: "/", search: location.search }}>
          Back to your library
        </Link>
      </p>

      {query.isPending ? (
        <div className="mt-8" role="status" aria-busy="true">
          <p className="sr-only">Loading tags</p>
          <ul aria-hidden="true" className="flex flex-col gap-3">
            {Array.from({ length: 4 }, (_, index) => (
              <li key={index} className="skeleton h-12 border border-line" />
            ))}
          </ul>
        </div>
      ) : null}

      {query.isError ? (
        <div role="alert" className="mt-8">
          <p>Could not load tags.</p>
          <button type="button" className="mt-4 min-h-11 bg-ink px-4 py-2 text-canvas" onClick={() => query.refetch()}>
            Retry
          </button>
        </div>
      ) : null}

      {!query.isPending && !query.isError && rows.length === 0 ? (
        <p className="mt-8">No tags yet. Add tags from any swatch.</p>
      ) : null}

      {!query.isPending && !query.isError && rows.length > 0 ? (
        <ul className="mt-8 flex flex-col gap-3">
          {rows.map((tag) => (
            <li key={tag.id} className="flex min-w-0 flex-wrap items-center gap-3 border border-line bg-surface p-3">
              {editingId === tag.id ? (
                <form
                  className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setFieldError(null);
                    returnFocusId.current = tag.id;
                    rename.mutate({ id: tag.id, name: draft, previous: tag.name });
                  }}
                >
                  <label className="sr-only" htmlFor={`tag-name-${tag.id}`}>
                    Tag name
                  </label>
                  <input
                    id={`tag-name-${tag.id}`}
                    className="min-w-0 flex-1 border border-ink bg-canvas px-3 py-2 text-base"
                    value={draft}
                    maxLength={30}
                    aria-invalid={fieldError ? true : undefined}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setFieldError(null);
                        returnFocusId.current = tag.id;
                        setEditingId(null);
                      }
                    }}
                  />
                  <button type="submit" className="min-h-11 bg-ink px-4 py-2 text-canvas">
                    Save
                  </button>
                  {fieldError ? <p role="alert">{fieldError}</p> : null}
                </form>
              ) : (
                <>
                  <p className="min-w-0 flex-1 break-words">
                    {tag.name} <span className="text-muted">({tag.items_count})</span>
                  </p>
                  <button
                    id={`rename-tag-${tag.id}`}
                    type="button"
                    className="min-h-11 underline"
                    onClick={() => {
                      returnFocusId.current = tag.id;
                      setFieldError(null);
                      setDraft(tag.name);
                      setEditingId(tag.id);
                    }}
                  >
                    Rename {tag.name}
                  </button>
                  <button
                    type="button"
                    className="min-h-11 underline"
                    onClick={(event) => {
                      deleteTrigger.current = event.currentTarget;
                      setPending(tag);
                    }}
                  >
                    Delete {tag.name}
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      <ToastViewport />
      <ConfirmDialog
        open={pending !== null}
        title={pending ? `Delete tag “${pending.name}”?` : "Delete tag?"}
        description={
          pending
            ? `It will be removed from ${pending.items_count} ${pending.items_count === 1 ? "swatch" : "swatches"}. The swatches stay in your library.`
            : ""
        }
        confirmLabel="Delete tag"
        cancelLabel="Cancel"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          const tag = pending;
          setPending(null);
          if (tag) remove.mutate(tag);
        }}
      />
    </div>
  );
}
