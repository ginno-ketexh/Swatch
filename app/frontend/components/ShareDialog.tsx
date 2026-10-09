import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { ApiError, createShareLink, deleteShareLink, listShareLinks } from "../api/client";
import type { ShareLinkRecord } from "../api/types";
import { copyText } from "../lib/copyText";
import { hideDialog, showDialog } from "../lib/dialog";
import { useImagesEnabled } from "../lib/imagesEnabled";
import { itemsKey } from "../lib/items";
import { ConfirmDialog } from "./ConfirmDialog";
import { useToast } from "./Toasts";

export type ShareTarget =
  | { kind: "item"; id: number; title: string; hasImage: boolean }
  | { kind: "tag"; id: number; title: string; itemsCount: number };

type Expiry = "1d" | "7d" | "30d" | "never";

const EXPIRY: { value: Expiry; label: string }[] = [
  { value: "1d", label: "1 day" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "never", label: "Never" },
];

type ShareDialogProps = {
  open: boolean;
  target: ShareTarget;
  onClose: () => void;
};

export function ShareButton({ target, label }: { target: ShareTarget; label: string }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button ref={buttonRef} type="button" className="min-h-11 underline" onClick={() => setOpen(true)}>
        {label}
      </button>
      <ShareDialog
        open={open}
        target={target}
        onClose={() => {
          setOpen(false);
          buttonRef.current?.focus();
        }}
      />
    </>
  );
}

export function ShareDialog({ open, target, onClose }: ShareDialogProps) {
  const imagesEnabled = useImagesEnabled();
  const queryClient = useQueryClient();
  const toast = useToast();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const [expires, setExpires] = useState<Expiry>("30d");
  const [includeNotes, setIncludeNotes] = useState(false);
  const [includePreview, setIncludePreview] = useState(false);
  const [title, setTitle] = useState("");
  const [created, setCreated] = useState<ShareLinkRecord | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingRevoke, setPendingRevoke] = useState<ShareLinkRecord | null>(null);

  const listKey = ["share-links", target.kind, target.id] as const;
  const links = useQuery({
    queryKey: listKey,
    queryFn: ({ signal }) =>
      listShareLinks(target.kind === "item" ? { itemId: target.id, status: "active" } : { tagId: target.id, status: "active" }, signal),
    enabled: open,
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;
    showDialog(dialog);
    return () => {
      hideDialog(dialog);
    };
  }, [open]);

  const create = useMutation({
    mutationFn: () =>
      createShareLink({
        ...(target.kind === "item" ? { item_id: target.id } : { tag_id: target.id }),
        title: title.trim() ? title.trim() : undefined,
        include_notes: includeNotes,
        include_preview_image: includePreview,
        expires_in: expires,
      }),
    onSuccess: (link) => {
      setCreated(link);
      setFormError(null);
      setNotice(null);
      void queryClient.invalidateQueries({ queryKey: ["share-links"] });
      void queryClient.invalidateQueries({ queryKey: itemsKey });
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError && error.status === 401) return;
      setFormError(error instanceof ApiError ? error.message : "Could not create the link");
    },
  });

  const revoke = useMutation({
    mutationFn: (id: number) => deleteShareLink(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<ShareLinkRecord[]>(listKey);
      queryClient.setQueryData<ShareLinkRecord[]>(listKey, (current) => (current ?? []).filter((link) => link.id !== id));
      return { previous };
    },
    onError: (error: unknown, _id, context) => {
      if (context?.previous) queryClient.setQueryData(listKey, context.previous);
      if (error instanceof ApiError && error.status === 404) toast.show("Already turned off", "error");
      else toast.show(error instanceof ApiError ? error.message : "Could not turn off the link", "error");
    },
    onSuccess: () => {
      toast.show("Link turned off", "success");
      void queryClient.invalidateQueries({ queryKey: ["share-links"] });
      void queryClient.invalidateQueries({ queryKey: itemsKey });
    },
  });

  if (!open) return null;

  const preview = previewState(target, imagesEnabled);
  const countLabel =
    target.kind === "tag"
      ? target.itemsCount === 1
        ? "1 swatch will be visible"
        : `${target.itemsCount} swatches will be visible`
      : null;

  function onKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  async function onCopy(url: string) {
    const result = await copyText(url, urlRef.current);
    setNotice(result === "copied" ? "Link copied" : "Press Ctrl+C");
  }

  const dialog = (
    <dialog
      ref={dialogRef}
      className="confirm-dialog max-w-lg"
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={onKeyDown}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <h2 id={titleId} className="font-display text-2xl">
        Share {target.title}
      </h2>
      {countLabel ? <p className="mt-3">{countLabel}</p> : null}
      {target.kind === "tag" ? (
        <p className="mt-3">{`Swatches you tag '${target.title}' later will also appear. Remove the tag from a swatch to hide it.`}</p>
      ) : null}

      <form
        className="mt-4"
        onSubmit={(event) => {
          event.preventDefault();
          setFormError(null);
          create.mutate();
        }}
      >
        <fieldset>
          <legend>Expires</legend>
          {EXPIRY.map((option) => (
            <label key={option.value} className="mt-2 flex min-h-6 items-center gap-2">
              <input
                type="radio"
                name="expires"
                value={option.value}
                checked={expires === option.value}
                onChange={() => setExpires(option.value)}
              />
              {option.label}
            </label>
          ))}
        </fieldset>
        <label className="mt-4 flex min-h-6 items-center gap-2">
          <input type="checkbox" checked={includeNotes} onChange={(event) => setIncludeNotes(event.target.checked)} />
          Include my notes
        </label>
        <label className="mt-3 flex min-h-6 items-center gap-2">
          <input
            type="checkbox"
            checked={includePreview}
            disabled={preview.disabled}
            onChange={(event) => setIncludePreview(event.target.checked)}
          />
          Show a picture when the link is pasted in chat apps
        </label>
        <p className="mt-1 text-muted">{preview.help}</p>
        <label className="mt-4 block" htmlFor={`${titleId}-title`}>
          Public title
        </label>
        <input
          id={`${titleId}-title`}
          className="mt-1 w-full border border-ink bg-canvas px-3 py-2"
          value={title}
          maxLength={80}
          onChange={(event) => setTitle(event.target.value)}
        />
        <p className="mt-1 text-muted">{title.length} / 80</p>
        {formError ? (
          <p role="alert" className="mt-3">
            {formError}
          </p>
        ) : null}
        <button type="submit" className="mt-4 min-h-11 bg-ink px-4 py-2 text-canvas" disabled={create.isPending}>
          {create.isPending ? "Creating…" : "Create link"}
        </button>
      </form>

      {created ? (
        <div className="mt-4">
          <label htmlFor={`${titleId}-url`}>Share link</label>
          <input id={`${titleId}-url`} ref={urlRef} className="mt-1 w-full border border-ink bg-canvas px-3 py-2" readOnly value={created.url} />
          <div className="mt-3 flex flex-wrap gap-3">
            <button type="button" className="min-h-11 bg-ink px-4 py-2 text-canvas" onClick={() => void onCopy(created.url)}>
              Copy link
            </button>
            <a className="inline-flex min-h-11 items-center underline" href={created.url} target="_blank" rel="noopener noreferrer">
              Open in new tab
            </a>
          </div>
        </div>
      ) : null}
      {notice ? (
        <p role="status" className="mt-3">
          {notice}
        </p>
      ) : null}

      <div className="mt-6">
        {links.isPending ? (
          <div role="status" aria-busy="true">
            <p className="sr-only">Loading links</p>
            <ul aria-hidden="true" className="flex flex-col gap-2">
              <li className="skeleton h-10 border border-line" />
              <li className="skeleton h-10 border border-line" />
            </ul>
          </div>
        ) : null}
        {links.isError ? (
          <div role="alert">
            <p>Could not load links.</p>
            <button type="button" className="mt-3 min-h-11 underline" onClick={() => void links.refetch()}>
              Retry
            </button>
          </div>
        ) : null}
        {links.isSuccess && links.data.length === 0 ? <p>No links yet</p> : null}
        {links.isSuccess && links.data.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {links.data.map((link) => (
              <li key={link.id} className="border border-line p-3">
                <p>{linkLabel(link)}</p>
                <div className="mt-2 flex flex-wrap gap-3">
                  <button type="button" className="min-h-11 underline" onClick={() => void onCopy(link.url)}>
                    Copy link to {target.title}
                  </button>
                  <button type="button" className="min-h-11 underline" onClick={() => setPendingRevoke(link)}>
                    Revoke
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <button type="button" className="mt-6 min-h-11 underline" onClick={onClose}>
        Close
      </button>
      <ConfirmDialog
        open={pendingRevoke !== null}
        title="Turn off this link?"
        description="Anyone who has it will see 'link not available'. You can create a new link any time."
        confirmLabel="Turn off"
        cancelLabel="Cancel"
        onCancel={() => setPendingRevoke(null)}
        onConfirm={() => {
          const link = pendingRevoke;
          setPendingRevoke(null);
          if (link) revoke.mutate(link.id);
        }}
      />
    </dialog>
  );

  return createPortal(dialog, document.body);
}

function previewState(target: ShareTarget, imagesEnabled: boolean): { disabled: boolean; help: string } {
  const kept = "Chat apps keep their own copy of the picture, even after you turn the link off.";
  if (!imagesEnabled) return { disabled: true, help: "Image uploads aren't set up yet" };
  if (target.kind === "item" && !target.hasImage) return { disabled: true, help: "Add an image first" };
  return { disabled: false, help: kept };
}

function linkLabel(link: ShareLinkRecord): string {
  const when = link.expires_at ? `Expires ${new Date(link.expires_at).toLocaleDateString("en-GB")}` : "Never expires";
  const views = link.views_count === 1 ? "1 view" : `${link.views_count} views`;
  return `${when}. ${views}.`;
}
