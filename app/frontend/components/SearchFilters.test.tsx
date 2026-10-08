import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Item } from "../api/types";
import { jsonResponse, renderApp } from "../test/renderApp";

const sample: Item = {
  id: 1,
  title: "Terracotta stair",
  source_url: "https://example.com/stairs",
  source_domain: "example.com",
  notes: "Warm plaster",
  color: "#7C2D24",
  created_at: new Date().toISOString(),
};

function stubFetch(impl: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    return Promise.resolve(impl(url, init));
  });
}

function library(items: Item[], total = items.length) {
  return (url: string, init?: RequestInit) => {
    if (url.includes("/api/v1/tags")) return jsonResponse([]);
    if ((init?.method ?? "GET") === "GET" && /\/items\/\d+$/.test(url)) {
      const id = Number(url.match(/(\d+)$/)?.[1]);
      const item = items.find((entry) => entry.id === id) ?? items[0];
      return jsonResponse(item);
    }
    return jsonResponse({ items, next_cursor: null, total_count: total, ignored_tags: [] });
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
});

describe("Search, tags, and filters", () => {
  it("waits 300ms before putting the search in the address", async () => {
    stubFetch(library([sample]));
    const { router } = renderApp("/");
    const search = await screen.findByLabelText("Search swatches");

    vi.useFakeTimers();
    fireEvent.change(search, { target: { value: "tile" } });
    await vi.advanceTimersByTimeAsync(299);
    expect(router.state.location.search).not.toContain("q=");
    await vi.advanceTimersByTimeAsync(1);
    expect(router.state.location.search).toContain("q=tile");
  });

  it("reads q, tags, and sort from the address and writes them back", async () => {
    stubFetch(library([sample]));
    const { router } = renderApp("/?q=tile&tags=brand,web%20design&sort=az&view=list");

    expect(await screen.findByLabelText("Search swatches")).toHaveValue("tile");
    expect(screen.getByLabelText("Sort by")).toHaveValue("az");
    expect(screen.getByRole("button", { name: "Remove filter brand" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove filter web design" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "List" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "oldest" } });
    expect(router.state.location.search).toContain("q=tile");
    expect(router.state.location.search).toContain("tags=brand,web%20design");
    expect(router.state.location.search).toContain("sort=oldest");
    expect(router.state.location.search).toContain("view=list");
  });

  it("announces the count, and Clear filters focuses the search", async () => {
    stubFetch((url) => {
      if (url.includes("/api/v1/tags")) return jsonResponse([]);
      if (url.includes("q=")) return jsonResponse({ items: [], next_cursor: null, total_count: 0, ignored_tags: [] });
      return jsonResponse({
        items: [sample, { ...sample, id: 2, title: "Olive door" }],
        next_cursor: null,
        total_count: 2,
        ignored_tags: [],
      });
    });
    const { router } = renderApp("/");

    expect(await screen.findByText("2 swatches match")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search swatches"), { target: { value: "missing" } });
    await waitFor(() => expect(router.state.location.search).toContain("q=missing"));
    expect(await screen.findByRole("heading", { name: "No swatches match “missing”" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByLabelText("Search swatches")).toHaveFocus();
    expect(router.state.location.search).not.toContain("q=");
  });

  it("keeps the layout when filters are cleared", async () => {
    stubFetch(library([]));
    const { router } = renderApp("/?q=missing&sort=az&view=list");

    fireEvent.click(await screen.findByRole("button", { name: "Clear filters" }));
    expect(router.state.location.search).toBe("?view=list");
  });

  it("uses a combobox for tags and announces the one that was added", async () => {
    stubFetch((url) => {
      if (url.includes("/api/v1/tags")) return jsonResponse([{ id: 4, name: "brand", items_count: 2 }]);
      return jsonResponse({ items: [], next_cursor: null });
    });
    renderApp("/items/new");

    const input = screen.getByRole("combobox", { name: "Add a tag" });
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).toHaveAttribute("aria-autocomplete", "list");

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "br" } });
    const list = await screen.findByRole("listbox");
    const brand = await screen.findByRole("option", { name: "brand" });
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(input).toHaveAttribute("aria-controls", list.id);

    for (let step = 0; step < 4 && input.getAttribute("aria-activedescendant") !== brand.id; step += 1) {
      fireEvent.keyDown(input, { key: "ArrowDown" });
    }
    expect(input).toHaveAttribute("aria-activedescendant", brand.id);

    fireEvent.keyDown(input, { key: "Enter" });
    expect(await screen.findByText("Added tag brand")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove tag brand" })).toBeInTheDocument();
    expect(input).toHaveFocus();
  });

  it("rolls a tag change back when the save fails", async () => {
    const tagged: Item = { ...sample, tags: [{ id: 3, name: "brand" }] };
    let finish: (response: Response) => void = () => {};
    stubFetch((url, init) => {
      if (url.includes("/api/v1/tags")) return jsonResponse([{ id: 3, name: "brand", items_count: 1 }]);
      if (init?.method === "PATCH") {
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      }
      return library([tagged])(url, init);
    });
    renderApp("/");

    fireEvent.click(await screen.findByRole("button", { name: "Terracotta stair" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove tag brand" }));

    await waitFor(() => expect(within(dialog).queryByRole("button", { name: "Remove tag brand" })).not.toBeInTheDocument());
    finish(jsonResponse({ error: "nope" }, 500));

    expect(await within(dialog).findByRole("button", { name: "Remove tag brand" })).toBeInTheDocument();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Could not save this swatch.");
  });

  it("shows a hostile tag name as text", async () => {
    const hostile: Item = { ...sample, tags: [{ id: 9, name: "<img src=x onerror=alert(1)>" }] };
    stubFetch(library([hostile]));
    renderApp("/");

    const chip = await screen.findByRole("button", { name: "Filter by tag <img src=x onerror=alert(1)>" });
    expect(chip.querySelector("img")).toBeNull();
    expect(document.querySelector("img")).toBeNull();
  });

  it("focuses search with / and ignores that key while typing or when shortcuts are off", async () => {
    stubFetch(library([sample]));
    renderApp("/");

    const search = await screen.findByLabelText("Search swatches");
    fireEvent.keyDown(document.body, { key: "/" });
    expect(search).toHaveFocus();

    fireEvent.change(search, { target: { value: "wool" } });
    fireEvent.keyDown(search, { key: "/" });
    expect(search).toHaveValue("wool");

    search.blur();
    fireEvent.click(screen.getByRole("button", { name: "Keyboard shortcuts" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("/ focuses the search");
    fireEvent.click(within(dialog).getByRole("button", { name: "Turn off single-key shortcuts" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    fireEvent.keyDown(document.body, { key: "/" });
    expect(search).not.toHaveFocus();
  });

  it("asks before deleting a tag", async () => {
    let deleted = false;
    stubFetch((url, init) => {
      if (init?.method === "DELETE") {
        deleted = true;
        return new Response(null, { status: 204 });
      }
      if (deleted) return jsonResponse([]);
      if (url.includes("/api/v1/tags")) return jsonResponse([{ id: 1, name: "brand", items_count: 12 }]);
      return jsonResponse({ items: [], next_cursor: null });
    });
    renderApp("/tags");

    const rename = await screen.findByRole("button", { name: "Rename brand" });
    fireEvent.click(rename);
    const field = screen.getByLabelText("Tag name");
    fireEvent.change(field, { target: { value: "label" } });
    fireEvent.keyDown(field, { key: "Escape" });
    expect(screen.getByRole("button", { name: "Rename brand" })).toHaveFocus();
    expect(screen.queryByLabelText("Tag name")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete brand" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Delete tag “brand”?");
    expect(dialog).toHaveTextContent("It will be removed from 12 swatches. The swatches stay in your library.");

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete tag" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Delete brand" })).not.toBeInTheDocument());
    expect(screen.getByText("No tags yet. Add tags from any swatch.")).toBeInTheDocument();
  });
});
