import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState, type DragEvent } from "react";
import { ApiError, deleteItemImage, updateImageAlt, uploadItemImage } from "../api/client";
import type { Item } from "../api/types";
import { ImagePrepareError, prepareImageFile, type PreparedImage } from "../lib/prepareImage";
import { ConfirmDialog } from "./ConfirmDialog";
import { Lightbox } from "./Lightbox";

export type ImageFieldHandle = {
  uploadTo: (itemId: number) => Promise<Item | null>;
  busy: () => boolean;
};

type Phase = "idle" | "uploading" | "processing";

export const ImageField = forwardRef<ImageFieldHandle, {
  enabled: boolean;
  item: Item | null;
  itemId: number | null;
  itemTitle: string;
  onChange: (item: Item) => void;
  onDirty: (dirty: boolean) => void;
  onSuggestColor: (hex: string) => void;
  onNotice?: (message: string, tone: "success" | "error") => void;
  prepare?: (file: File) => Promise<PreparedImage>;
}>(function ImageField({
  enabled,
  item,
  itemId,
  itemTitle,
  onChange,
  onDirty,
  onSuggestColor,
  onNotice,
  prepare = prepareImageFile,
}, ref) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chooseRef = useRef<HTMLButtonElement>(null);
  const altRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<string | null>(null);
  const preparedRef = useRef<PreparedImage | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestRef = useRef(0);
  const phaseRef = useRef<Phase>("idle");
  const lastBucket = useRef(-1);
  const acceptRef = useRef<(files: File[]) => Promise<void>>(async () => undefined);
  const sendRef = useRef<(nextItemId: number, nextPrepared: PreparedImage) => Promise<Item>>(async () => {
    throw new Error("Upload is not ready");
  });
  const fieldId = useId();
  const [dragOver, setDragOver] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [announced, setAnnounced] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<PreparedImage | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [suggestionUsed, setSuggestionUsed] = useState(false);
  const [alt, setAlt] = useState(item?.image?.alt ?? "");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const viewButton = useRef<HTMLButtonElement>(null);

  function rememberPhase(next: Phase) {
    phaseRef.current = next;
    setPhase(next);
  }

  function storePrepared(next: PreparedImage | null) {
    preparedRef.current = next;
    setPrepared(next);
  }

  function rememberPreview(url: string | null) {
    if (previewRef.current && previewRef.current !== url) URL.revokeObjectURL(previewRef.current);
    previewRef.current = url;
    setPreviewUrl(url);
  }

  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const root = rootRef.current;
      if (!root) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
      const active = document.activeElement;
      const inField = target instanceof Node && root.contains(target);
      const scope = active instanceof Element ? active.closest("[data-image-scope]") : null;
      const inScope = Boolean(scope?.contains(root));
      if (!inField && !inScope) return;
      const file = event.clipboardData?.files?.[0];
      if (!file) return;
      event.preventDefault();
      void acceptRef.current([file]);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  function announceProgress(percent: number) {
    const bucket = Math.min(100, Math.floor(percent / 25) * 25);
    if (bucket === lastBucket.current) return;
    lastBucket.current = bucket;
    setAnnounced(`Uploading ${percent}%`);
  }

  async function acceptFiles(files: File[]) {
    if (!enabled) return;
    setNotice(files.length > 1 ? "Only one image per swatch. Used the first one." : null);
    const file = files[0];
    if (!file) return;
    if (file.size === 0 && file.type === "") {
      setError("That isn't an image.");
      setAnnounced("");
      queueMicrotask(() => chooseRef.current?.focus());
      return;
    }
    try {
      const next = await prepare(file);
      storePrepared(next);
      rememberPreview(next.previewUrl);
      setSuggestion(next.color);
      setSuggestionUsed(false);
      setError(null);
      onDirty(true);
      if (itemId) await send(itemId, next);
    } catch (reason) {
      if (reason instanceof ApiError) return;
      const message = reason instanceof ImagePrepareError ? reason.message : "We couldn't read that image";
      setError(message);
      queueMicrotask(() => chooseRef.current?.focus());
    }
  }

  async function send(nextItemId: number, nextPrepared: PreparedImage): Promise<Item> {
    const request = ++requestRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    rememberPhase("uploading");
    setProgress(0);
    lastBucket.current = -1;
    setError(null);
    const replacing = Boolean(item?.image);
    try {
      const saved = await uploadItemImage(nextItemId, nextPrepared.file, alt.trim(), (percent) => {
        setProgress(percent);
        announceProgress(percent);
        if (percent >= 100) rememberPhase("processing");
      }, controller.signal);
      if (request !== requestRef.current) return saved;
      const added = replacing ? "Image replaced" : "Image added";
      setAnnounced(added);
      rememberPhase("idle");
      storePrepared(null);
      onDirty(false);
      onChange(saved);
      onNotice?.(added, "success");
      queueMicrotask(() => altRef.current?.focus());
      return saved;
    } catch (reason) {
      if (request !== requestRef.current) throw reason;
      if (reason instanceof ApiError && reason.message === "Upload cancelled") {
        rememberPhase("idle");
        throw reason;
      }
      const message = reason instanceof ApiError ? reason.message : "The image could not be uploaded. Check your connection and try again.";
      setError(message);
      rememberPhase("idle");
      queueMicrotask(() => chooseRef.current?.focus());
      throw reason;
    }
  }

  acceptRef.current = acceptFiles;
  sendRef.current = send;

  useImperativeHandle(ref, () => ({
    uploadTo: (nextItemId: number) => {
      const next = preparedRef.current;
      if (!next) return Promise.resolve(null);
      return sendRef.current(nextItemId, next);
    },
    busy: () => phaseRef.current === "uploading" || phaseRef.current === "processing",
  }), []);

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);
    void acceptFiles([...event.dataTransfer.files]);
  }

  async function removeImage() {
    if (!item?.image) return;
    abortRef.current?.abort();
    const previous = item;
    setRemoving(true);
    onChange({ ...item, image: null });
    try {
      await deleteItemImage(item.id);
      setAlt("");
      setSuggestion(null);
      storePrepared(null);
      rememberPreview(null);
      setRemoving(false);
      onNotice?.("Image removed", "success");
      queueMicrotask(() => chooseRef.current?.focus());
    } catch (reason) {
      onChange(previous);
      setRemoving(false);
      const message = reason instanceof ApiError && reason.status === 404 ? "Image already removed" : "Could not remove the image.";
      setError(message);
      onNotice?.(message, "error");
    }
  }

  async function saveAlt() {
    if (!item?.image) return;
    try {
      const saved = await updateImageAlt(item.id, alt);
      onChange(saved);
      onNotice?.("Description saved", "success");
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Could not save the description.");
    }
  }

  const existing = item?.image ?? null;
  const shown = previewUrl ?? existing?.urls.large ?? null;
  const chooseLabel = existing ? `Replace image for ${itemTitle}` : "Choose an image";
  const showAlt = Boolean(shown);

  if (!enabled) {
    return (
      <p className="border border-line px-3 py-3">
        {"Image uploads aren't set up yet. The steps are in docs/DEPLOY_RENDER.md."}
      </p>
    );
  }

  return (
    <div ref={rootRef} className="flex flex-col gap-3">
      <div
        className={dragOver ? "dropzone dropzone-active" : "dropzone"}
        aria-label="Add an image"
        onDragEnter={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <div className="cover cover-grid" style={item?.color ? { backgroundColor: item.color } : undefined}>
          {shown ? <img src={shown} alt="" /> : null}
        </div>
        <button
          ref={chooseRef}
          type="button"
          className="min-h-11 bg-ink px-4 py-2 text-canvas"
          aria-describedby={error ? `${fieldId}-error` : undefined}
          onClick={() => inputRef.current?.click()}
        >
          {chooseLabel}
        </button>
        <p>{dragOver ? "Drop the image to add it" : "or drag it here, or paste"}</p>
        <input
          ref={inputRef}
          className="sr-only"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          aria-label={chooseLabel}
          onChange={(event) => {
            const files = [...(event.target.files ?? [])];
            event.target.value = "";
            void acceptFiles(files);
          }}
        />
      </div>

      {phase === "uploading" ? (
        <div>
          <label htmlFor={`${fieldId}-progress`}>Uploading {progress}%</label>
          <progress id={`${fieldId}-progress`} max={100} value={progress} aria-label={`Uploading ${progress}%`} />
          <button type="button" className="ml-3 min-h-11 underline" onClick={() => abortRef.current?.abort()}>
            Cancel
          </button>
        </div>
      ) : null}
      {phase === "processing" ? <p role="status">Processing…</p> : null}
      <p aria-live="polite" className="sr-only">{error ? "" : announced}</p>
      {error ? (
        <div id={`${fieldId}-error`} role="alert">
          <p>{error}</p>
          {prepared ? (
            <button type="button" className="mt-2 min-h-11 underline" onClick={() => itemId && void send(itemId, prepared)}>
              Retry
            </button>
          ) : null}
        </div>
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}

      {suggestion && !suggestionUsed ? (
        <div>
          <p aria-live="polite" className="sr-only">Colour suggestion available: {suggestion}</p>
          <button
            type="button"
            className="min-h-11 border border-ink px-3 py-2"
            onClick={() => {
              setSuggestionUsed(true);
              onSuggestColor(suggestion);
            }}
          >
            <span className="mr-2 inline-block size-4 border border-ink align-middle" style={{ backgroundColor: suggestion }} aria-hidden="true" />
            {item?.color ? `Replace colour with ${suggestion}` : `Use colour from image ${suggestion}`}
          </button>
          <button type="button" className="ml-3 min-h-11 underline" onClick={() => setSuggestion(null)}>
            No thanks
          </button>
        </div>
      ) : null}

      {showAlt ? (
        <div>
          <label className="block" htmlFor={`${fieldId}-alt`}>Describe the image (helps screen readers)</label>
          <input
            ref={altRef}
            id={`${fieldId}-alt`}
            className="mt-1 w-full border border-ink bg-canvas px-3 py-2"
            maxLength={250}
            value={alt}
            onChange={(event) => {
              setAlt(event.target.value);
              onDirty(true);
            }}
            onKeyDown={(event) => {
              if (!existing) return;
              if (event.key === "Enter") {
                event.preventDefault();
                void saveAlt();
              } else if (event.key === "Escape") {
                event.preventDefault();
                setAlt(existing.alt ?? "");
              }
            }}
          />
          <p className="mt-1 text-muted">{[...alt].length} / 250</p>
        </div>
      ) : null}

      {existing && !existing.alt ? (
        <p>
          <button type="button" className="min-h-11 underline" onClick={() => altRef.current?.focus()}>
            No description yet. Add one
          </button>
        </p>
      ) : null}

      {existing ? (
        <div className="flex flex-wrap gap-3">
          <button ref={viewButton} type="button" className="min-h-11 underline" onClick={() => setLightbox(true)}>
            View larger
          </button>
          <button
            type="button"
            className="min-h-11 underline"
            disabled={removing}
            onClick={() => {
              abortRef.current?.abort();
              setConfirmRemove(true);
            }}
          >
            {removing ? "Removing…" : `Remove image for ${itemTitle}`}
          </button>
        </div>
      ) : null}

      {existing && lightbox ? (
        <Lightbox
          image={existing}
          title={itemTitle}
          open={lightbox}
          onClose={() => {
            setLightbox(false);
            viewButton.current?.focus();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={confirmRemove}
        title="Remove this image?"
        description="The swatch and its notes stay."
        confirmLabel="Remove image"
        cancelLabel="Cancel"
        onCancel={() => setConfirmRemove(false)}
        onConfirm={() => {
          setConfirmRemove(false);
          void removeImage();
        }}
      />
    </div>
  );
});
