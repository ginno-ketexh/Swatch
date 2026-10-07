import type { KeyboardEvent } from "react";

export function showDialog(dialog: HTMLDialogElement) {
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

export function hideDialog(dialog: HTMLDialogElement) {
  if (!dialog.open && !dialog.hasAttribute("open")) return;
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

export function trapTab(event: KeyboardEvent, dialog: HTMLElement | null) {
  if (event.key !== "Tab" || !dialog) return;
  if (typeof (dialog as HTMLDialogElement).showModal === "function") return;

  const items = [...dialog.querySelectorAll<HTMLElement>("button, [href], input, select, textarea")].filter(
    (element) => !element.hasAttribute("disabled"),
  );
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
