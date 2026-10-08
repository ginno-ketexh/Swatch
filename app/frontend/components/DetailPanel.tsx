import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ApiError, getItem, updateItem } from "../api/client";
import type { Item, ItemInput } from "../api/types";
import { hideDialog, showDialog, trapTab } from "../lib/dialog";
import {
  findCachedItemIn,
  itemToInput,
  itemsKey,
  normalizeColor,
  normalizeUrl,
  replaceItem,
  restoreItemCaches,
  savedLabel,
  snapshotItemCaches,
  sourceDomain,
  tagsFromNames,
  updateItemCaches,
  validateItem,
} from "../lib/items";
import { ImageField } from "./ImageField";
import { useImagesEnabled } from "../lib/imagesEnabled";
import { TagCombobox } from "./TagCombobox";
import { ToastViewport, useToast } from "./Toasts";

function pickerColor(color: string): string {
  if (/^#[0-9A-Fa-f]{6}$/.test(color)) return color.toLowerCase();
  const ink = getComputedStyle(document.documentElement).getPropertyValue("--swatch-color-ink").trim();
  return /^#[0-9A-Fa-f]{6}$/.test(ink) ? ink.toLowerCase() : "#000000";
}

function applyInput(item: Item, input: ItemInput): Item {
  const source = normalizeUrl(input.source_url);
  const notes = input.notes.trim();
  return {
    ...item,
    title: input.title.trim(),
    source_url: source,
    source_domain: sourceDomain(source),
    notes: notes.length > 0 ? notes : null,
    color: normalizeColor(input.color),
  };
}

function saveErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 429) {
    return "Too many saves. Wait a moment and try again.";
  }
  if (error instanceof ApiError) {
    const field = Object.values(error.fieldErrors).flat()[0];
    if (field) return field;
  }
  return "Could not save this swatch.";
}

export function DetailPanel() {
  const { id = "" } = useParams();
  const numericId = Number(id);
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const toast = useToast();
  const imagesEnabled = useImagesEnabled();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const closing = useRef(false);
  const editingRef = useRef(false);
  const escapeHandled = useRef(false);
  const titleId = useId();
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [editingColor, setEditingColor] = useState(false);
  const [colorDraft, setColorDraft] = useState("");

  const cached = Number.isInteger(numericId) ? findCachedItemIn(queryClient, numericId) : undefined;

  const detail = useQuery({
    queryKey: ["item", id],
    queryFn: ({ signal }) => getItem(id, signal),
    placeholderData: cached,
    enabled: Number.isInteger(numericId) && numericId > 0,
  });

  const item = detail.data ?? cached;
  const missing = detail.error instanceof ApiError && detail.error.status === 404;

  const save = useMutation({
    mutationFn: ({ itemId, input }: { itemId: number; input: ItemInput; previous: Item }) => updateItem(itemId, input),
    onMutate: async ({ input, previous }) => {
      await queryClient.cancelQueries({ queryKey: itemsKey });
      await queryClient.cancelQueries({ queryKey: ["item", id] });
      const previousLists = snapshotItemCaches(queryClient);
      const previousItem = queryClient.getQueryData<Item>(["item", id]) ?? previous;
      const optimistic = applyInput(previous, input);
      updateItemCaches(queryClient, (current) => replaceItem(current, optimistic));
      queryClient.setQueryData<Item>(["item", id], optimistic);
      return { previousLists, previousItem };
    },
    onError: (error, _variables, context) => {
      if (context?.previousLists) restoreItemCaches(queryClient, context.previousLists);
      if (context?.previousItem) queryClient.setQueryData(["item", id], context.previousItem);
      cancelEditors();
      toast.show(saveErrorMessage(error), "error");
    },
    onSuccess: (saved) => {
      queryClient.setQueryData<Item>(["item", id], saved);
      updateItemCaches(queryClient, (current) => replaceItem(current, saved));
      cancelEditors();
      toast.show("Saved", "success");
    },
  });

  const saveTags = useMutation({
    mutationFn: ({ itemId, names }: { itemId: number; names: string[]; previous: Item }) => updateItem(itemId, { tag_names: names }),
    onMutate: async ({ names, previous }) => {
      await queryClient.cancelQueries({ queryKey: itemsKey });
      await queryClient.cancelQueries({ queryKey: ["item", id] });
      const previousLists = snapshotItemCaches(queryClient);
      const previousItem = queryClient.getQueryData<Item>(["item", id]) ?? previous;
      const optimistic = { ...previous, tags: tagsFromNames(names, previous.tags ?? []) };
      updateItemCaches(queryClient, (current) => replaceItem(current, optimistic));
      queryClient.setQueryData<Item>(["item", id], optimistic);
      return { previousLists, previousItem };
    },
    onError: (error, _variables, context) => {
      if (context?.previousLists) restoreItemCaches(queryClient, context.previousLists);
      if (context?.previousItem) queryClient.setQueryData(["item", id], context.previousItem);
      toast.show(saveErrorMessage(error), "error");
    },
    onSuccess: (saved) => {
      queryClient.setQueryData<Item>(["item", id], saved);
      updateItemCaches(queryClient, (current) => replaceItem(current, saved));
      toast.show("Saved", "success");
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: itemsKey });
      await queryClient.invalidateQueries({ queryKey: ["tags"] });
    },
  });

  useEffect(() => {
    const opener = document.activeElement;
    const openerId = opener instanceof HTMLElement && opener.id.startsWith("swatch-card-") ? opener.id : `swatch-card-${id}`;
    const dialog = dialogRef.current;
    if (!dialog) return;

    showDialog(dialog);
    if (titleRef.current) titleRef.current.focus();
    else dialog.querySelector<HTMLElement>("button")?.focus();

    return () => {
      hideDialog(dialog);
      const back = document.getElementById(openerId);
      if (back) back.focus();
      else document.getElementById("main")?.focus();
    };
  }, [id]);

  useEffect(() => {
    const title = titleRef.current;
    const dialog = dialogRef.current;
    if (!title || !dialog) return;
    const back = dialog.querySelector("button");
    if (document.activeElement === back || document.activeElement === dialog) title.focus();
  }, [item?.title, missing, detail.isError]);

  function cancelEditors() {
    editingRef.current = false;
    setEditingTitle(false);
    setEditingColor(false);
  }

  function close() {
    if (closing.current) return;
    closing.current = true;
    if (location.key !== "default") navigate(-1);
    else navigate({ pathname: "/", search: location.search });
  }

  function requestClose() {
    if (escapeHandled.current) {
      escapeHandled.current = false;
      return;
    }
    if (editingRef.current) {
      cancelEditors();
      return;
    }
    close();
  }

  function markEscapeHandled() {
    escapeHandled.current = true;
    queueMicrotask(() => {
      escapeHandled.current = false;
    });
  }

  function startTitle() {
    if (!item || save.isPending) return;
    setTitleDraft(item.title);
    setEditingColor(false);
    setEditingTitle(true);
    editingRef.current = true;
    queueMicrotask(() => document.getElementById("detail-title-input")?.focus());
  }

  function startColor() {
    if (!item || save.isPending) return;
    setColorDraft(item.color ?? "");
    setEditingTitle(false);
    setEditingColor(true);
    editingRef.current = true;
    queueMicrotask(() => document.getElementById("detail-color-input")?.focus());
  }

  function commit(partial: Partial<ItemInput>) {
    if (!item || save.isPending) return;
    const input = { ...itemToInput(item), ...partial };
    const errors = validateItem(input);
    const message = Object.values(errors)[0];
    if (message) {
      toast.show(message, "error");
      return;
    }
    save.mutate({ itemId: item.id, input, previous: item });
  }

  function onEditorEscape(event: KeyboardEvent) {
    event.preventDefault();
    event.stopPropagation();
    markEscapeHandled();
    cancelEditors();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      requestClose();
      return;
    }
    trapTab(event, dialogRef.current);
  }

  const showSkeleton = !item && !missing && (detail.isPending || detail.isFetching);

  return (
    <dialog
      ref={dialogRef}
      className="detail-panel"
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={onKeyDown}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
    >
      <button type="button" className="min-h-11 underline" onClick={close}>
        Back
      </button>

      {missing ? (
        <h2 id={titleId} ref={titleRef} tabIndex={-1} className="mt-4 font-display text-3xl">
          {"This swatch isn't in your library"}
        </h2>
      ) : null}

      {showSkeleton ? (
        <div className="mt-4" role="status" aria-busy="true">
          <p className="sr-only">Loading swatch</p>
          <div className="skeleton h-8" />
          <div className="skeleton mt-4 h-24" />
        </div>
      ) : null}

      {!missing && !item && detail.isError ? (
        <h2 id={titleId} ref={titleRef} tabIndex={-1} className="mt-4 font-display text-3xl">
          Could not open this swatch.
        </h2>
      ) : null}

      {item && !missing ? (
        <div className="mt-4" data-image-scope="">
          <ImageField
            enabled={imagesEnabled}
            item={item}
            itemId={item.id}
            itemTitle={item.title}
            onDirty={() => undefined}
            onSuggestColor={(hex) => commit({ color: hex })}
            onNotice={(message, tone) => toast.show(message, tone)}
            onChange={(saved) => {
              queryClient.setQueryData<Item>(["item", id], saved);
              updateItemCaches(queryClient, (current) => replaceItem(current, saved));
            }}
          />

          <h2 id={titleId} ref={titleRef} tabIndex={-1} className="font-display text-3xl">
            {editingTitle ? (
              <span data-quick-edit>
                <input
                  id="detail-title-input"
                  aria-label="Title"
                  className="w-full border border-ink bg-canvas px-3 py-2 font-sans text-base"
                  value={titleDraft}
                  onChange={(event) => setTitleDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commit({ title: titleDraft });
                    } else if (event.key === "Escape") {
                      onEditorEscape(event);
                    }
                  }}
                />
              </span>
            ) : (
              <button type="button" className="text-left font-display text-3xl" onClick={startTitle}>
                {item.title}
              </button>
            )}
          </h2>

          {editingColor ? (
            <div className="mt-4" data-quick-edit>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  aria-label="Colour picker"
                  type="color"
                  value={pickerColor(colorDraft)}
                  onChange={(event) => setColorDraft(event.target.value.toUpperCase())}
                />
                <input
                  id="detail-color-input"
                  aria-label="Hex colour"
                  className="w-full max-w-40 border border-ink bg-canvas px-3 py-2 text-base"
                  value={colorDraft}
                  spellCheck={false}
                  onChange={(event) => setColorDraft(event.target.value.toUpperCase())}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commit({ color: colorDraft });
                    } else if (event.key === "Escape") {
                      onEditorEscape(event);
                    }
                  }}
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-3">
                <button type="button" className="min-h-11 bg-ink px-4 py-2 text-canvas" onClick={() => commit({ color: colorDraft })}>
                  Save colour
                </button>
                <button type="button" className="min-h-11 underline" onClick={() => setColorDraft("")}>
                  Clear colour
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-4">
              <button type="button" className="min-h-11" onClick={startColor}>
                <span
                  className="inline-block size-4 border border-ink align-middle"
                  style={{ backgroundColor: item.color ?? "transparent" }}
                  aria-hidden="true"
                />{" "}
                {item.color ?? "No colour"}
              </button>
            </p>
          )}

          {item.source_url ? (
            <p className="mt-4 break-words">
              <a href={item.source_url} target="_blank" rel="noopener noreferrer">
                {item.source_domain ?? item.source_url}
                <span> (opens in a new tab)</span>
              </a>
            </p>
          ) : (
            <p className="mt-4">No source link</p>
          )}
          <p className="mt-2 text-muted">{savedLabel(item.created_at)}</p>
          {item.notes ? <p className="mt-4 break-words whitespace-pre-wrap">{item.notes}</p> : null}
          <div className="mt-6">
            <TagCombobox
              id="detail-tags"
              tags={(item.tags ?? []).map((tag) => tag.name)}
              onChange={(names) => {
                if (!item) return;
                saveTags.mutate({ itemId: item.id, names, previous: item });
              }}
            />
          </div>
          <p className="mt-6">
            <Link className="min-h-11 underline" to={{ pathname: `/items/${item.id}/edit`, search: location.search }}>
              Edit all details
            </Link>
          </p>
        </div>
      ) : null}

      <ToastViewport />
    </dialog>
  );
}
