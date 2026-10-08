import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useImagesEnabled } from "../lib/imagesEnabled";
import { Link, useBlocker, useLocation, useNavigate, useParams } from "react-router-dom";
import { ApiError, createItem, getItem, updateItem } from "../api/client";
import type { ItemInput } from "../api/types";
import {
  emptyItem,
  itemToFormInput,
  itemsKey,
  optimisticItem,
  prependItem,
  replaceItem,
  restoreItemCaches,
  snapshotItemCaches,
  updateItemCaches,
  validateItem,
} from "../lib/items";
import { ConfirmDialog } from "./ConfirmDialog";
import { ImageField, type ImageFieldHandle } from "./ImageField";
import { TagCombobox } from "./TagCombobox";

function usePoliteCount(value: string, max: number): string {
  const [announced, setAnnounced] = useState("");

  useEffect(() => {
    const id = window.setTimeout(() => {
      setAnnounced(`${[...value].length} of ${max} characters`);
    }, 1000);
    return () => window.clearTimeout(id);
  }, [value, max]);

  return announced;
}

function pickerColor(color: string): string {
  if (/^#[0-9A-Fa-f]{6}$/.test(color)) return color.toLowerCase();
  const ink = getComputedStyle(document.documentElement).getPropertyValue("--swatch-color-ink").trim();
  return /^#[0-9A-Fa-f]{6}$/.test(ink) ? ink.toLowerCase() : "#000000";
}

export function ItemForm() {
  const { id } = useParams();
  const editing = id !== undefined;
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const formId = useId();
  const summaryRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const allowLeave = useRef(false);
  const imageRef = useRef<ImageFieldHandle>(null);
  const imagesEnabled = useImagesEnabled();
  const [imageDirty, setImageDirty] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(editing ? Number(id) : null);
  const [values, setValues] = useState<ItemInput>(emptyItem);
  const [baseline, setBaseline] = useState<ItemInput>(emptyItem);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState<string | null>(null);
  const [errorNonce, setErrorNonce] = useState(0);
  const titleCount = usePoliteCount(values.title, 120);
  const notesCount = usePoliteCount(values.notes, 2000);

  const existing = useQuery({
    queryKey: ["item", id],
    queryFn: ({ signal }) => getItem(id ?? "", signal),
    enabled: editing,
    retry: false,
  });

  const [loadedId, setLoadedId] = useState<number | null>(null);
  if (existing.data && existing.data.id !== loadedId) {
    const next = itemToFormInput(existing.data);
    setLoadedId(existing.data.id);
    setValues(next);
    setBaseline(next);
  }

  const dirty = JSON.stringify(values) !== JSON.stringify(baseline) || imageDirty;
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (allowLeave.current) return false;
    return dirty && currentLocation.pathname !== nextLocation.pathname;
  });

  useEffect(() => {
    if (!dirty || allowLeave.current) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (errorNonce === 0) return;
    summaryRef.current?.focus();
  }, [errorNonce]);

  const save = useMutation({
    mutationFn: (input: ItemInput) => (editing && existing.data ? updateItem(existing.data.id, input) : createItem(input)),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: itemsKey });
      const previous = snapshotItemCaches(queryClient);
      const optimistic = optimisticItem(input, editing && existing.data ? existing.data.id : -Date.now());
      updateItemCaches(queryClient, (current) => (editing ? replaceItem(current, optimistic) : prependItem(current, optimistic)));
      return { previous };
    },
    onError: (error, _input, context) => {
      if (context?.previous) restoreItemCaches(queryClient, context.previous);
      else queryClient.removeQueries({ queryKey: itemsKey });

      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) {
        const next: Record<string, string> = {};
        for (const [key, messages] of Object.entries(error.fieldErrors)) {
          if (messages[0]) next[key] = messages[0];
        }
        setFieldErrors(next);
      }
      setSummary(error instanceof ApiError ? error.message : "Could not save this swatch. Nothing was changed.");
      setErrorNonce((nonce) => nonce + 1);
    },
    onSuccess: async (saved) => {
      setSavedId(saved.id);
      try {
        await imageRef.current?.uploadTo(saved.id);
      } catch {
        setSummary("The swatch was saved, but the image was not. Use Retry.");
        setErrorNonce((nonce) => nonce + 1);
        return;
      }
      allowLeave.current = true;
      navigate("/");
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: itemsKey });
      await queryClient.invalidateQueries({ queryKey: ["tags"] });
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (save.isPending) return;

    const nextErrors = validateItem(values);
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      setSummary("Check the highlighted fields.");
      setErrorNonce((nonce) => nonce + 1);
      return;
    }

    setFieldErrors({});
    setSummary(null);
    save.mutate(values);
  }

  if (editing && existing.isPending) {
    return (
      <p role="status" aria-busy="true">
        Loading swatch…
      </p>
    );
  }

  if (editing && existing.isError) {
    const missing = existing.error instanceof ApiError && existing.error.status === 404;
    return (
      <div role="alert">
        <h1 className="font-display text-4xl">{missing ? "This swatch is not in your library." : "Could not open this swatch."}</h1>
        <p className="mt-3">{missing ? "It may already have been removed." : "Try again from your library."}</p>
        <Link className="mt-6 inline-block min-h-11 underline" to={{ pathname: "/", search: location.search }}>
          Back to library
        </Link>
      </div>
    );
  }

  function describedBy(field: string, helpId: string): string {
    return fieldErrors[field] ? `${fieldId(field)} ${helpId}` : helpId;
  }

  function fieldId(field: string): string {
    return `${formId}-${field}-error`;
  }

  return (
    <div>
      <h1 className="font-display text-4xl">{editing ? "Edit swatch" : "Add a swatch"}</h1>
      <p className="mt-3">
        <Link className="underline" to={{ pathname: "/", search: location.search }}>
          Back to library
        </Link>
      </p>
      {summary ? (
        <div ref={summaryRef} tabIndex={-1} role="alert" className="mt-6 border border-accent px-3 py-3">
          <p className="font-display text-xl">{summary}</p>
          {Object.keys(fieldErrors).length > 0 ? (
            <ul className="mt-2 list-disc pl-5">
              {Object.entries(fieldErrors).map(([field, message]) => (
                <li key={field}>
                  <a href={`#${anchorFor(formId, field)}`}>
                    {labelFor(field)}: {message}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <form className="mt-6 flex flex-col gap-6" data-image-scope="" noValidate onSubmit={onSubmit}>
        <div>
          <label className="block" htmlFor={`${formId}-title`}>
            Title <span>(required)</span>
          </label>
          <p id={`${formId}-title-help`} className="mt-1 text-muted">
            Required. Up to 120 characters.
          </p>
          <input
            ref={titleRef}
            id={`${formId}-title`}
            className="mt-2 w-full border border-ink bg-canvas px-3 py-2 text-base"
            value={values.title}
            aria-required="true"
            aria-invalid={fieldErrors.title ? true : undefined}
            aria-describedby={describedBy("title", `${formId}-title-help`)}
            onChange={(event) => setValues({ ...values, title: event.target.value })}
          />
          <p aria-hidden="true" className="mt-1 text-muted">
            {[...values.title].length} / 120
          </p>
          <p data-testid="title-count-live" aria-live="polite" className="sr-only">
            {titleCount}
          </p>
          {fieldErrors.title ? (
            <p id={fieldId("title")} className="mt-1">
              {fieldErrors.title}
            </p>
          ) : null}
        </div>

        <div>
          <label className="block" htmlFor={`${formId}-source`}>
            Source link
          </label>
          <p id={`${formId}-source-help`} className="mt-1 text-muted">
            Optional. Only an http or https link.
          </p>
          <input
            id={`${formId}-source`}
            className="mt-2 w-full border border-ink bg-canvas px-3 py-2 text-base"
            inputMode="url"
            value={values.source_url}
            aria-invalid={fieldErrors.source_url ? true : undefined}
            aria-describedby={describedBy("source_url", `${formId}-source-help`)}
            onChange={(event) => setValues({ ...values, source_url: event.target.value })}
          />
          {fieldErrors.source_url ? (
            <p id={fieldId("source_url")} className="mt-1">
              {fieldErrors.source_url}
            </p>
          ) : null}
        </div>

        <div>
          <label className="block" htmlFor={`${formId}-notes`}>
            Notes
          </label>
          <p id={`${formId}-notes-help`} className="mt-1 text-muted">
            Optional. Up to 2000 characters. Saved and shown as plain text.
          </p>
          <textarea
            id={`${formId}-notes`}
            className="mt-2 w-full border border-ink bg-canvas px-3 py-2 text-base"
            rows={5}
            value={values.notes}
            aria-invalid={fieldErrors.notes ? true : undefined}
            aria-describedby={describedBy("notes", `${formId}-notes-help`)}
            onChange={(event) => setValues({ ...values, notes: event.target.value })}
          />
          <p aria-hidden="true" className="mt-1 text-muted">
            {[...values.notes].length} / 2000
          </p>
          <p aria-live="polite" className="sr-only">
            {notesCount}
          </p>
          {fieldErrors.notes ? (
            <p id={fieldId("notes")} className="mt-1">
              {fieldErrors.notes}
            </p>
          ) : null}
        </div>

        <div>
          <label className="block" htmlFor={`${formId}-color`}>
            Colour
          </label>
          <p id={`${formId}-color-help`} className="mt-1 text-muted">
            Optional. Use the picker or type a hex value such as #RRGGBB.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <input
              id={`${formId}-color-picker`}
              aria-label="Colour picker"
              type="color"
              value={pickerColor(values.color)}
              onChange={(event) => setValues({ ...values, color: event.target.value.toUpperCase() })}
            />
            <input
              id={`${formId}-color`}
              className="w-full max-w-40 border border-ink bg-canvas px-3 py-2 text-base"
              value={values.color}
              aria-invalid={fieldErrors.color ? true : undefined}
              aria-describedby={describedBy("color", `${formId}-color-help`)}
              onChange={(event) => setValues({ ...values, color: event.target.value.toUpperCase() })}
              spellCheck={false}
            />
            <button type="button" className="min-h-11 underline" onClick={() => setValues({ ...values, color: "" })}>
              Clear colour
            </button>
          </div>
          {fieldErrors.color ? (
            <p id={fieldId("color")} className="mt-1">
              {fieldErrors.color}
            </p>
          ) : null}
        </div>

        <ImageField
          ref={imageRef}
          enabled={imagesEnabled}
          item={existing.data ?? null}
          itemId={savedId}
          itemTitle={values.title || "this swatch"}
          onChange={(saved) => {
            queryClient.setQueryData(["item", String(saved.id)], saved);
            updateItemCaches(queryClient, (current) => replaceItem(current, saved));
          }}
          onDirty={setImageDirty}
          onSuggestColor={(hex) => setValues((current) => ({ ...current, color: hex }))}
        />

        <TagCombobox
          id={`${formId}-tags`}
          tags={values.tag_names ?? []}
          onChange={(tagNames) => setValues({ ...values, tag_names: tagNames })}
        />

        <div>
          <button type="submit" className="min-h-11 bg-ink px-4 py-2 text-canvas" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save swatch"}
          </button>
          <p role="status" className="sr-only">
            {save.isPending ? "Saving…" : ""}
          </p>
        </div>
      </form>
      <ConfirmDialog
        open={blocker.state === "blocked"}
        title="Discard unsaved changes?"
        description="Your edits are still on this form. Leaving now drops them."
        confirmLabel="Leave without saving"
        cancelLabel="Stay"
        onCancel={() => {
          if (blocker.state === "blocked") blocker.reset();
          titleRef.current?.focus();
        }}
        onConfirm={() => {
          if (blocker.state === "blocked") blocker.proceed();
        }}
      />
    </div>
  );
}

function anchorFor(formId: string, field: string): string {
  switch (field) {
    case "source_url":
      return `${formId}-source`;
    case "title":
      return `${formId}-title`;
    case "notes":
      return `${formId}-notes`;
    case "color":
      return `${formId}-color`;
    default:
      return `${formId}-title`;
  }
}

function labelFor(field: string): string {
  switch (field) {
    case "title":
      return "Title";
    case "source_url":
      return "Source link";
    case "notes":
      return "Notes";
    case "color":
      return "Colour";
    default:
      return field;
  }
}
