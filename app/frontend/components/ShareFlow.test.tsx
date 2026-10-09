import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { navigation } from "../api/client";
import type { Item, ShareLinkRecord } from "../api/types";
import { expectNoSeriousViolations } from "../test/axe";
import { jsonResponse, renderApp } from "../test/renderApp";

const sample: Item = {
  id: 1,
  title: "Terracotta stair",
  source_url: "https://example.com/stairs",
  source_domain: "example.com",
  notes: "Warm step",
  color: "#7C2D24",
  created_at: "2026-10-01T00:00:00Z",
  shared: true,
  image: {
    alt: "Stair",
    width: 12,
    height: 8,
    content_type: "image/png",
    byte_size: 100,
    version: 1,
    urls: { card: "/c", card_2x: "/c2", large: "/l" },
  },
};

const link = (id: number, overrides: Partial<ShareLinkRecord> = {}): ShareLinkRecord => ({
  id,
  url: `https://swatch.example/s/link${id}xxxxxxxxxxxxxxxxxxxxxxxxxxx`,
  kind: "item",
  target_title: "Terracotta stair",
  title: null,
  include_notes: false,
  include_preview_image: false,
  expires_at: "2026-11-01T00:00:00Z",
  views_count: 1,
  last_viewed_at: "2026-10-08T00:00:00Z",
  status: "active",
  created_at: "2026-10-02T00:00:00Z",
  item_id: 1,
  tag_id: null,
  ...overrides,
});

function stubFetch(impl: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    return Promise.resolve(impl(url, init));
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("share dialog", () => {
  it("starts from the defaults, copies the link, and returns focus", async () => {
    const writes: unknown[] = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: (value: string) => {
          writes.push(value);
          return Promise.resolve();
        },
      },
    });
    stubFetch((url, init) => {
      if (url.includes("/api/v1/share_links") && init?.method === "POST") {
        return jsonResponse(link(7, { url: "https://swatch.example/s/ready" }), 201);
      }
      if (url.includes("/api/v1/share_links")) return jsonResponse([]);
      if (url.includes("/api/v1/tags")) return jsonResponse([]);
      if (/\/items\/\d+$/.test(url)) return jsonResponse(sample);
      return jsonResponse({ items: [sample], next_cursor: null });
    });

    renderApp("/items/1", { imagesEnabled: true });
    const opener = await screen.findByRole("button", { name: "Share" });
    fireEvent.click(opener);
    const dialog = await screen.findByRole("dialog", { name: "Share Terracotta stair" });
    expect(within(dialog).getByRole("radio", { name: "30 days" })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: "Include my notes" })).not.toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: "Show a picture when the link is pasted in chat apps" })).not.toBeChecked();
    expect(within(dialog).getByText(/Chat apps keep their own copy/)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Create link" }));
    const field = await within(dialog).findByRole("textbox", { name: "Share link" });
    expect(field).toHaveValue("https://swatch.example/s/ready");
    fireEvent.click(within(dialog).getByRole("button", { name: "Copy link" }));
    expect(await within(dialog).findByRole("status")).toHaveTextContent("Link copied");
    expect(writes).toEqual(["https://swatch.example/s/ready"]);

    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("selects the link when the clipboard is refused", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error("nope")) },
    });
    stubFetch((url, init) => {
      if (url.includes("/api/v1/share_links") && init?.method === "POST") return jsonResponse(link(8), 201);
      if (url.includes("/api/v1/share_links")) return jsonResponse([]);
      if (url.includes("/api/v1/tags")) return jsonResponse([]);
      if (/\/items\/\d+$/.test(url)) return jsonResponse(sample);
      return jsonResponse({ items: [sample], next_cursor: null });
    });
    renderApp("/items/1", { imagesEnabled: true });
    fireEvent.click(await screen.findByRole("button", { name: "Share" }));
    const dialog = await screen.findByRole("dialog", { name: "Share Terracotta stair" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create link" }));
    await within(dialog).findByRole("textbox", { name: "Share link" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Copy link" }));
    expect(await within(dialog).findByRole("status")).toHaveTextContent("Press Ctrl+C");
  });

  it("explains that image uploads are not set up", async () => {
    stubFetch((url) => {
      if (url.includes("/api/v1/share_links")) return jsonResponse([]);
      if (url.includes("/api/v1/tags")) return jsonResponse([]);
      if (/\/items\/\d+$/.test(url)) return jsonResponse(sample);
      return jsonResponse({ items: [sample], next_cursor: null });
    });
    renderApp("/items/1");
    fireEvent.click(await screen.findByRole("button", { name: "Share" }));
    const dialog = await screen.findByRole("dialog", { name: "Share Terracotta stair" });
    expect(within(dialog).getByRole("checkbox", { name: "Show a picture when the link is pasted in chat apps" })).toBeDisabled();
    expect(within(dialog).getByText("Image uploads aren't set up yet")).toBeInTheDocument();
  });

  it("asks for a picture only after uploads are on and the swatch has none", async () => {
    stubFetch((url) => {
      if (url.includes("/api/v1/share_links")) return jsonResponse([]);
      if (url.includes("/api/v1/tags")) return jsonResponse([]);
      if (/\/items\/\d+$/.test(url)) return jsonResponse({ ...sample, image: null });
      return jsonResponse({ items: [], next_cursor: null });
    });
    renderApp("/items/1", { imagesEnabled: true });
    fireEvent.click(await screen.findByRole("button", { name: "Share" }));
    expect(await screen.findByText("Add an image first")).toBeInTheDocument();
  });

  it("warns that later swatches with the tag will appear", async () => {
    stubFetch((url) => {
      if (url.includes("/api/v1/tags")) return jsonResponse([{ id: 4, name: "packaging", items_count: 12 }]);
      if (url.includes("/api/v1/share_links")) return jsonResponse([]);
      return jsonResponse({ items: [], next_cursor: null });
    });
    renderApp("/tags");
    fireEvent.click(await screen.findByRole("button", { name: "Share this tag packaging" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("12 swatches will be visible")).toBeInTheDocument();
    expect(within(dialog).getByText(/Swatches you tag 'packaging' later will also appear/)).toBeInTheDocument();
  });

  it("does not leave the page when creating a link signs you out", async () => {
    const assign = vi.spyOn(navigation, "assign").mockImplementation(() => {});
    stubFetch((url, init) => {
      if (url.includes("/api/v1/share_links") && init?.method === "POST") return jsonResponse({ error: "Sign in required" }, 401);
      if (url.includes("/api/v1/share_links")) return jsonResponse([]);
      if (url.includes("/api/v1/tags")) return jsonResponse([]);
      if (/\/items\/\d+$/.test(url)) return jsonResponse(sample);
      return jsonResponse({ items: [sample], next_cursor: null });
    });
    renderApp("/items/1", { imagesEnabled: true });
    fireEvent.click(await screen.findByRole("button", { name: "Share" }));
    fireEvent.click(await screen.findByRole("button", { name: "Create link" }));
    expect(await screen.findByRole("dialog", { name: "Share Terracotta stair" })).toBeInTheDocument();
    expect(assign).not.toHaveBeenCalled();
  });
});

describe("shared links", () => {
  it("filters from the URL, turns a link off, and rolls back a failure", async () => {
    const rows = [link(3, { views_count: 3, last_viewed_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() })];
    let deleteResult: Response = jsonResponse({ error: "nope" }, 500);
    let release: (response: Response) => void = () => {};
    let pending = new Promise<Response>((resolve) => {
      release = resolve;
    });
    stubFetch((url, init) => {
      if (url.includes("/api/v1/share_links") && init?.method === "DELETE") return pending;
      if (url.includes("status=expired")) return jsonResponse([]);
      if (url.includes("/api/v1/share_links")) return jsonResponse(rows);
      return jsonResponse({ items: [], next_cursor: null });
    });

    renderApp("/shares");
    expect(await screen.findByRole("link", { name: "Terracotta stair" })).toHaveAttribute("href", "/items/1");
    expect(screen.getByText(/Opened 3 times, last/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Turn off link to Terracotta stair" }));
    fireEvent.click(screen.getByRole("button", { name: "Turn off" }));
    expect(await screen.findByText("You haven't shared anything yet. Use Share on any swatch or tag.")).toBeInTheDocument();
    release(deleteResult);
    expect(await screen.findByRole("link", { name: "Terracotta stair" })).toBeInTheDocument();

    deleteResult = new Response(null, { status: 204 });
    pending = new Promise<Response>((resolve) => {
      release = resolve;
    });
    fireEvent.click(screen.getByRole("button", { name: "Turn off link to Terracotta stair" }));
    fireEvent.click(screen.getByRole("button", { name: "Turn off" }));
    expect(await screen.findByText("You haven't shared anything yet. Use Share on any swatch or tag.")).toBeInTheDocument();
    release(deleteResult);
    expect(await screen.findByText("Link turned off")).toBeInTheDocument();
  });

  it("shows an empty expired list and an already-off link", async () => {
    stubFetch((url, init) => {
      if (init?.method === "DELETE") return jsonResponse({ error: "Not found" }, 404);
      if (url.includes("status=expired")) {
        return jsonResponse([link(9, { status: "expired", expires_at: "2020-01-01T00:00:00Z" })]);
      }
      return jsonResponse([]);
    });
    renderApp("/shares?status=expired");
    expect(await screen.findByRole("button", { name: "Remove link to Terracotta stair" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove link to Terracotta stair" }));
    expect(screen.getByText("It is already unavailable.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(await screen.findByText("Already turned off")).toBeInTheDocument();
  });

  it("shows the empty active state", async () => {
    stubFetch(() => jsonResponse([]));
    renderApp("/shares");
    expect(await screen.findByText("You haven't shared anything yet. Use Share on any swatch or tag.")).toBeInTheDocument();
  });
});

describe("shared badge and axe", () => {
  it("shows a Shared badge with text and an icon", async () => {
    stubFetch((url) => {
      if (url.includes("/api/v1/tags")) return jsonResponse([]);
      return jsonResponse({ items: [sample], next_cursor: null });
    });
    const view = renderApp("/");
    expect(await screen.findByText("Shared")).toBeInTheDocument();
    expect(document.querySelector("svg")).toBeTruthy();
    await expectNoSeriousViolations(view.container);
  });

  it("has no serious axe violations on the share dialog, shared links, or manage tags", async () => {
    stubFetch((url) => {
      if (url.includes("/api/v1/tags")) return jsonResponse([{ id: 4, name: "packaging", items_count: 12 }]);
      if (url.includes("/api/v1/share_links")) return jsonResponse([link(3, { kind: "tag", tag_id: 4, item_id: null, target_title: "packaging" })]);
      if (/\/items\/\d+$/.test(url)) return jsonResponse(sample);
      return jsonResponse({ items: [sample], next_cursor: null });
    });
    const library = renderApp("/items/1", { imagesEnabled: true });
    fireEvent.click(await screen.findByRole("button", { name: "Share" }));
    await screen.findByRole("dialog", { name: "Share Terracotta stair" });
    await expectNoSeriousViolations(document.body);
    library.unmount();

    const shares = renderApp("/shares");
    await screen.findByRole("heading", { name: "Shared links" });
    await expectNoSeriousViolations(document.body);
    shares.unmount();

    renderApp("/tags");
    await screen.findByRole("button", { name: "Share this tag packaging" });
    await expectNoSeriousViolations(document.body);
  });
});
