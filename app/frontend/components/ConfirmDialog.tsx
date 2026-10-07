import { useEffect, useRef, type KeyboardEvent } from "react";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

function showDialog(dialog: HTMLDialogElement) {
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function hideDialog(dialog: HTMLDialogElement) {
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

function focusable(dialog: HTMLElement): HTMLElement[] {
  return [...dialog.querySelectorAll<HTMLElement>("button, [href], input, select, textarea")].filter(
    (element) => !element.hasAttribute("disabled"),
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = "confirm-dialog-title";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;

    showDialog(dialog);
    dialog.querySelector<HTMLElement>("[data-cancel]")?.focus();

    return () => {
      hideDialog(dialog);
    };
  }, [open]);

  if (!open) return null;

  function onKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
      return;
    }

    if (event.key !== "Tab") return;
    const dialog = dialogRef.current;
    if (!dialog || typeof dialog.showModal === "function") return;

    const items = focusable(dialog);
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="confirm-dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={onKeyDown}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <h2 id={titleId} className="font-display text-2xl">
        {title}
      </h2>
      <p className="mt-3">{description}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" data-cancel className="min-h-11 border border-ink bg-canvas px-4 py-2" onClick={onCancel}>
          {cancelLabel}
        </button>
        <button type="button" className="min-h-11 bg-ink px-4 py-2 text-canvas" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
