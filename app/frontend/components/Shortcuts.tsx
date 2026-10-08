import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { hideDialog, showDialog, trapTab } from "../lib/dialog";

export const SHORTCUTS_STORAGE_KEY = "swatch-single-key-shortcuts";

function shortcutsEnabled(): boolean {
  try {
    return window.localStorage.getItem(SHORTCUTS_STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

function writeShortcutsEnabled(enabled: boolean) {
  try {
    window.localStorage.setItem(SHORTCUTS_STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // The switch still works until the page is reloaded.
  }
}

function typingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export function Shortcuts() {
  const navigate = useNavigate();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(shortcutsEnabled);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key !== "n" && event.key !== "?" && event.key !== "/") return;
      if (typingTarget(event.target)) return;

      const dialog = event.target instanceof HTMLElement ? event.target.closest("dialog") : null;
      if (dialog && dialog.id !== "shortcuts-dialog") return;
      if (!shortcutsEnabled()) return;

      if (event.key === "/") {
        const search = document.getElementById("swatch-search");
        if (!(search instanceof HTMLElement)) return;
        event.preventDefault();
        search.focus();
        return;
      }

      event.preventDefault();
      if (event.key === "n") {
        setOpen(false);
        navigate("/items/new");
        return;
      }
      setOpen((current) => !current);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;

    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    showDialog(dialog);
    titleRef.current?.focus();
    return () => {
      hideDialog(dialog);
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);

  function toggleEnabled() {
    const next = !enabled;
    writeShortcutsEnabled(next);
    setEnabled(next);
  }

  function onDialogKeyDown(event: ReactKeyboardEvent<HTMLDialogElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    trapTab(event, dialogRef.current);
  }

  return (
    <>
      <button type="button" className="min-h-11 underline" onClick={() => setOpen(true)}>
        Keyboard shortcuts
      </button>
      {open ? (
        <dialog
          ref={dialogRef}
          id="shortcuts-dialog"
          className="confirm-dialog"
          aria-modal="true"
          aria-labelledby="shortcuts-title"
          onKeyDown={onDialogKeyDown}
          onCancel={(event) => {
            event.preventDefault();
            setOpen(false);
          }}
        >
          <h2 id="shortcuts-title" ref={titleRef} tabIndex={-1} className="font-display text-2xl">
            Keyboard shortcuts
          </h2>
          <ul className="mt-4 list-disc pl-5">
            <li>Arrow keys move between swatches.</li>
            <li>Enter opens the swatch you are on.</li>
            <li>
              <kbd>n</kbd> starts a new swatch.
            </li>
            <li>
              <kbd>/</kbd> focuses the search.
            </li>
            <li>
              <kbd>?</kbd> opens this dialog.
            </li>
            <li>Escape closes a panel.</li>
          </ul>
          <p className="mt-4">
            {enabled
              ? "Single-key shortcuts are on."
              : "Single-key shortcuts are off. Arrow keys still move between swatches."}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" className="min-h-11 border border-ink px-4 py-2" aria-pressed={enabled} onClick={toggleEnabled}>
              {enabled ? "Turn off single-key shortcuts" : "Turn on single-key shortcuts"}
            </button>
            <button type="button" className="min-h-11 underline" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
        </dialog>
      ) : null}
    </>
  );
}
