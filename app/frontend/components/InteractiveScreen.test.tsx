import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Item } from "../api/types";
import { jsonResponse, renderApp } from "../test/renderApp";

const sample: Item = {
  id: 1,
  title: "Terracotta stair",
  source_url: "https://example.com/stairs",
  source_domain: "example.com",
  notes: "Warm <script>alert(1)</script>",
  color: "#7C2D24",
  created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
};

const second: Item = { ...sample, id: 2, title: "Olive door", notes: "Quiet green", color: "#445566" };

function stubFetch(impl: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    return Promise.resolve(impl(url, init));
  });
}

function libraryResponse(items: Item[]) {
  return (url: string, init?: RequestInit) => {
    if ((init?.method ?? "GET") === "GET" && /\/items\/\d+$/.test(url)) {
      const id = Number(url.match(/(\d+)$/)?.[1]);
      const item = items.find((entry) => entry.id === id);
      if (!item) return jsonResponse({ error: "Not found" }, 404);
      return jsonResponse(item);
    }
    return jsonResponse({ items, next_cursor: null });
  };
}

function pressEnter(element: HTMLElement) {
  const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  element.dispatchEvent(event);
  if (!event.defaultPrevented && element instanceof HTMLButtonElement) element.click();
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
});

describe("Interactive screen", () => {
  it("opens a side panel from a card, traps focus on the title, and returns focus on Escape", async () => {
    stubFetch(libraryResponse([sample]));
    const { router } = renderApp("/");

    const card = await screen.findByRole("button", { name: "Terracotta stair" });
    fireEvent.click(card);

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    const title = within(dialog).getByRole("heading", { name: "Terracotta stair" });
    expect(title).toHaveFocus();
    expect(dialog).toHaveAttribute("aria-labelledby", title.id);
    expect(within(dialog).getByText(/Warm/)).toBeInTheDocument();

    fireEvent.keyDown(dialog, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(card).toHaveFocus();
    expect(router.state.location.pathname).toBe("/");
  });

  it("opens a deep link over the library and Back returns to the list", async () => {
    stubFetch(libraryResponse([sample]));
    const { router } = renderApp("/items/1");

    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByRole("heading", { name: "Terracotta stair" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your swatches" })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Back" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("says when a swatch is missing", async () => {
    stubFetch((url) => {
      if (/\/items\/9$/.test(url)) return jsonResponse({ error: "Not found" }, 404);
      return jsonResponse({ items: [], next_cursor: null });
    });

    renderApp("/items/9");

    expect(await screen.findByRole("heading", { name: "This swatch isn't in your library" })).toBeInTheDocument();
  });

  it("shows a cached swatch in the panel before the detail request finishes", async () => {
    let detailStarted = false;
    stubFetch((url, init) => {
      if ((init?.method ?? "GET") === "GET" && /\/items\/1$/.test(url)) {
        detailStarted = true;
        return new Promise(() => {}) as unknown as Response;
      }
      return jsonResponse({ items: [sample], next_cursor: null });
    });
    renderApp("/");

    fireEvent.click(await screen.findByRole("button", { name: "Terracotta stair" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Terracotta stair" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("status")).not.toBeInTheDocument();
    expect(detailStarted).toBe(true);
  });

  it("switches between grid and list without another request", async () => {
    let calls = 0;
    stubFetch((url, init) => {
      if (url.includes("/api/v1/tags")) return jsonResponse([]);
      calls += 1;
      return libraryResponse([sample])(url, init);
    });
    const { router } = renderApp("/");

    expect(await screen.findByText(/Warm/)).toBeInTheDocument();
    const before = calls;
    fireEvent.click(screen.getByRole("button", { name: "List" }));

    expect(screen.getByRole("button", { name: "List" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Grid" })).toHaveAttribute("aria-pressed", "false");
    expect(calls).toBe(before);
    expect(window.localStorage.getItem("swatch-library-view")).toBe("list");
    expect(router.state.location.search).toBe("?view=list");
    expect(screen.queryByText(/Warm/)).not.toBeInTheDocument();
  });

  it("lets the address win over the saved layout, and ignores an unknown layout", async () => {
    window.localStorage.setItem("swatch-library-view", "grid");
    stubFetch(libraryResponse([sample]));
    const { unmount } = renderApp("/?view=list");

    expect(await screen.findByRole("button", { name: "List" })).toHaveAttribute("aria-pressed", "true");
    unmount();

    window.localStorage.setItem("swatch-library-view", "list");
    renderApp("/?view=nope");

    expect(await screen.findByRole("button", { name: "Grid" })).toHaveAttribute("aria-pressed", "true");
  });

  it("moves with the arrow keys and opens the focused card", async () => {
    stubFetch(libraryResponse([sample, second]));
    renderApp("/?view=list");

    const first = await screen.findByRole("button", { name: "Terracotta stair" });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowDown" });

    const next = screen.getByRole("button", { name: "Olive door" });
    expect(next).toHaveFocus();
    expect(next).toHaveAttribute("tabindex", "0");
    expect(first).toHaveAttribute("tabindex", "-1");

    pressEnter(next);

    expect(await screen.findByRole("dialog")).toHaveTextContent("Olive door");
  });

  it("opens a new swatch with n, and ignores that key in a field or when shortcuts are off", async () => {
    stubFetch(libraryResponse([sample]));
    const { router } = renderApp("/");

    await screen.findByRole("heading", { name: "Your swatches" });
    fireEvent.keyDown(document.body, { key: "n" });

    expect(await screen.findByRole("heading", { name: "Add a swatch" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/items/new");

    await router.navigate("/");
    const card = await screen.findByRole("button", { name: "Terracotta stair" });
    fireEvent.click(card);
    const dialog = await screen.findByRole("dialog");
    fireEvent.keyDown(dialog, { key: "n" });
    expect(router.state.location.pathname).toBe("/items/1");

    fireEvent.click(within(dialog).getByRole("button", { name: "Terracotta stair" }));
    const title = within(dialog).getByLabelText("Title");
    fireEvent.keyDown(title, { key: "n" });
    expect(router.state.location.pathname).toBe("/items/1");

    fireEvent.keyDown(title, { key: "Escape" });
    await waitFor(() => expect(within(dialog).queryByLabelText("Title")).not.toBeInTheDocument());
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Keyboard shortcuts" }));
    const shortcuts = await screen.findByRole("dialog");
    fireEvent.click(within(shortcuts).getByRole("button", { name: "Turn off single-key shortcuts" }));
    fireEvent.click(within(shortcuts).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    fireEvent.keyDown(document.body, { key: "n" });
    expect(screen.getByRole("heading", { name: "Your swatches" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Add a swatch" })).not.toBeInTheDocument();
  });

  it("opens the shortcuts dialog with ?", async () => {
    stubFetch(() => jsonResponse({ items: [], next_cursor: null }));
    renderApp("/");

    await screen.findByRole("heading", { name: "Your swatches" });
    fireEvent.keyDown(document.body, { key: "?" });

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("n starts a new swatch");
    expect(within(dialog).getByRole("heading", { name: "Keyboard shortcuts" })).toHaveFocus();
  });

  it("rolls a failed rename back and announces the error", async () => {
    let finish: (response: Response) => void = () => {};
    stubFetch((url, init) => {
      if (init?.method === "PATCH") {
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      }
      return libraryResponse([sample])(url, init);
    });
    renderApp("/");

    fireEvent.click(await screen.findByRole("button", { name: "Terracotta stair" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Terracotta stair" }));
    const title = within(dialog).getByLabelText("Title");
    fireEvent.change(title, { target: { value: "New name" } });
    fireEvent.keyDown(title, { key: "Enter" });

    await waitFor(() => expect(document.getElementById("swatch-card-1")).toHaveTextContent("New name"));
    finish(jsonResponse({ error: "nope" }, 500));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Could not save this swatch.");
    await waitFor(() => expect(document.getElementById("swatch-card-1")).toHaveTextContent("Terracotta stair"));
    expect(within(dialog).getByRole("heading", { name: "Terracotta stair" })).toBeInTheDocument();
  });

  it("keeps the server's validation message", async () => {
    stubFetch((url, init) => {
      if (init?.method === "PATCH") return jsonResponse({ errors: { title: ["has already been taken"] } }, 422);
      return libraryResponse([sample])(url, init);
    });
    renderApp("/");

    fireEvent.click(await screen.findByRole("button", { name: "Terracotta stair" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Terracotta stair" }));
    fireEvent.change(within(dialog).getByLabelText("Title"), { target: { value: "Taken name" } });
    fireEvent.keyDown(within(dialog).getByLabelText("Title"), { key: "Enter" });

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("has already been taken");
    expect(document.getElementById("swatch-card-1")).toHaveTextContent("Terracotta stair");
  });

  it("explains a rate limit in plain language", async () => {
    stubFetch((url, init) => {
      if (init?.method === "PATCH") return jsonResponse({ error: "Too many requests" }, 429);
      return libraryResponse([sample])(url, init);
    });
    renderApp("/");

    fireEvent.click(await screen.findByRole("button", { name: "Terracotta stair" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "#7C2D24" }));
    fireEvent.change(within(dialog).getByLabelText("Colour picker"), { target: { value: "#123abc" } });
    expect(within(dialog).getByLabelText("Hex colour")).toHaveValue("#123ABC");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save colour" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Too many saves. Wait a moment and try again.");
    expect(screen.queryAllByText("#123ABC")).toHaveLength(0);
    expect(screen.getAllByText("#7C2D24").length).toBeGreaterThan(0);
  });

  it("dismisses a toast from the keyboard and pauses while the pointer is over it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let deleted = false;
    stubFetch((_url, init) => {
      if (init?.method === "DELETE") {
        deleted = true;
        return new Response(null, { status: 204 });
      }
      if (deleted) return jsonResponse({ items: [], next_cursor: null });
      return jsonResponse({ items: [sample], next_cursor: null });
    });
    renderApp("/");

    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove swatch" }));

    const toast = await screen.findByRole("status");
    expect(toast).toHaveTextContent("Removed");
    fireEvent.mouseEnter(toast);
    await vi.advanceTimersByTimeAsync(7000);
    expect(screen.getByRole("status")).toHaveTextContent("Removed");

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
