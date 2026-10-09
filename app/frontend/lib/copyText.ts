export async function copyText(value: string, field: HTMLInputElement | null): Promise<"copied" | "fallback"> {
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(value);
      return "copied";
    }
  } catch {
    // The browser refused the clipboard. Select the field instead.
  }

  if (field) {
    field.focus();
    field.select();
  }
  return "fallback";
}
