import { useEffect, useId, useRef, useState } from "react";
import type { ItemImage } from "../api/types";
import { hideDialog, showDialog, trapTab } from "../lib/dialog";

export function Lightbox({
  image,
  title,
  open,
  onClose,
}: {
  image: ItemImage;
  title: string;
  open: boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [playing, setPlaying] = useState(false);
  const reduceMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const animated = image.content_type === "image/gif";
  const still = reduceMotion && animated && !playing;
  const src = still ? image.urls.card_2x : image.urls.large;
  const caption = image.alt?.trim() ? image.alt : `Image for ${title}`;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;
    showDialog(dialog);
    closeRef.current?.focus();
    return () => hideDialog(dialog);
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      className="lightbox"
      aria-modal="true"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
          return;
        }
        trapTab(event, dialogRef.current);
      }}
    >
      <h2 id={titleId} className="sr-only">
        {caption}
      </h2>
      <img src={src} alt={caption} />
      {image.alt ? <p className="mt-3">{image.alt}</p> : null}
      {still ? (
        <button type="button" className="mt-3 min-h-11 underline" onClick={() => setPlaying(true)}>
          Play animation
        </button>
      ) : null}
      <button ref={closeRef} type="button" className="mt-4 min-h-11 bg-ink px-4 py-2 text-canvas" onClick={onClose}>
        Close
      </button>
    </dialog>
  );
}
