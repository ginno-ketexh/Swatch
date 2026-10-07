import { fireEvent, screen, waitFor } from "@testing-library/react";
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

function stubFetch(impl: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    return Promise.resolve(impl(url, init));
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
});

describe("LibraryPage", () => {
  it("shows six skeleton cards while the first page loads", () => {
    stubFetch(() => new Promise(() => {}) as unknown as Response);

    renderApp("/");

    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(screen.getAllByRole("listitem", { hidden: true })).toHaveLength(6);
  });

  it("shows an empty state that starts a new swatch", async () => {
    stubFetch(() => jsonResponse({ items: [], next_cursor: null }));

    renderApp("/");

    expect(await screen.findByRole("button", { name: "Add your first swatch" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Nothing saved yet" })).toBeInTheDocument();
  });

  it("shows an error state and retries", async () => {
    let calls = 0;
    stubFetch(() => {
      calls += 1;
      if (calls === 1) return jsonResponse({ error: "nope" }, 500);
      return jsonResponse({ items: [], next_cursor: null });
    });

    renderApp("/");

    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));

    expect(await screen.findByRole("button", { name: "Add your first swatch" })).toBeInTheDocument();
  });

  it("renders a card with the hex text, the source, the date, and plain-text notes", async () => {
    stubFetch(() => jsonResponse({ items: [sample], next_cursor: null }));

    renderApp("/");

    expect(await screen.findByRole("heading", { name: "Terracotta stair" })).toBeInTheDocument();
    expect(screen.getByText("#7C2D24")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /example.com/ });
    expect(link).toHaveAttribute("href", "https://example.com/stairs");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveTextContent("opens in a new tab");
    expect(screen.getByText(/Saved/)).toHaveTextContent(/3 days ago/);
    const notes = screen.getByText(/Warm/);
    expect(notes.textContent).toContain("<script>alert(1)</script>");
    expect(notes.querySelector("script")).toBeNull();
    expect(screen.getByRole("list")).toBeInTheDocument();
  });

  it("appends the next page from Load more", async () => {
    const second: Item = { ...sample, id: 2, title: "Olive door", notes: null };
    let release: (response: Response) => void = () => {};
    stubFetch((url) => {
      if (url.includes("cursor=")) {
        return new Promise<Response>((resolve) => {
          release = resolve;
        });
      }
      return jsonResponse({ items: [sample], next_cursor: "abc" });
    });

    renderApp("/");

    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
    expect(await screen.findByRole("button", { name: "Loading more…" })).toBeDisabled();

    release(jsonResponse({ items: [second], next_cursor: null }));

    expect(await screen.findByRole("heading", { name: "Olive door" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Terracotta stair" })).toBeInTheDocument();
  });

  it("asks before removing, closes on Escape, and returns focus", async () => {
    stubFetch(() => jsonResponse({ items: [sample], next_cursor: null }));
    renderApp("/");

    const remove = await screen.findByRole("button", { name: "Remove" });
    fireEvent.click(remove);

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Remove this swatch?");
    fireEvent.keyDown(dialog, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(remove).toHaveFocus();
  });

  it("uses the native dialog when the browser provides it", async () => {
    const showModal = vi.fn(function showModal(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    });
    HTMLDialogElement.prototype.showModal = showModal;
    stubFetch(() => jsonResponse({ items: [sample], next_cursor: null }));
    renderApp("/");

    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));

    await waitFor(() => expect(showModal).toHaveBeenCalled());
  });

  it("drops an item that was already removed", async () => {
    let deleted = false;
    stubFetch((_url, init) => {
      if (init?.method === "DELETE") {
        deleted = true;
        return jsonResponse({ error: "Not found" }, 404);
      }
      if (deleted) return jsonResponse({ items: [], next_cursor: null });
      return jsonResponse({ items: [sample], next_cursor: null });
    });
    renderApp("/");

    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove swatch" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Already removed");
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Terracotta stair" })).not.toBeInTheDocument());
  });

  it("restores the item when removal fails", async () => {
    stubFetch((_url, init) => {
      if (init?.method === "DELETE") return jsonResponse({ error: "nope" }, 500);
      return jsonResponse({ items: [sample], next_cursor: null });
    });
    renderApp("/");

    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove swatch" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not remove this swatch");
    expect(await screen.findByRole("heading", { name: "Terracotta stair" })).toBeInTheDocument();
  });
});
