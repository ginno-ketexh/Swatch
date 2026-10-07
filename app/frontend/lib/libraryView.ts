export const VIEW_STORAGE_KEY = "swatch-library-view";

export type LibraryView = "grid" | "list";

function storedView(): LibraryView | null {
  try {
    const value = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (value === "grid" || value === "list") return value;
  } catch {
    return null;
  }
  return null;
}

export function writeStoredView(view: LibraryView) {
  try {
    window.localStorage.setItem(VIEW_STORAGE_KEY, view);
  } catch {
    // A blocked storage write still leaves the choice in the URL.
  }
}

// The address wins. A missing choice falls back to the last one saved on
// this browser. Anything else is the grid.
export function libraryView(search: string): LibraryView {
  const value = new URLSearchParams(search).get("view");
  if (value === "grid" || value === "list") return value;
  if (value !== null) return "grid";
  return storedView() === "list" ? "list" : "grid";
}
