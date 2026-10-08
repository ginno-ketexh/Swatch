import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { navigation } from "../api/client";
import { jsonResponse, renderApp } from "../test/renderApp";

function stubFetch(impl: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    return Promise.resolve(impl(url, init));
  });
}

describe("sign-in state in the library", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.history.pushState({}, "", "/");
  });

  it("shows a truncated email and posts sign out with the csrf token", () => {
    const meta = document.createElement("meta");
    meta.name = "csrf-token";
    meta.content = "csrf-test-token";
    document.head.append(meta);

    stubFetch(() => jsonResponse({ items: [], next_cursor: null, total_count: 0, ignored_tags: [] }));
    renderApp("/");

    expect(screen.getByText("Signed in as o…@e…")).toHaveAttribute("title", "owner@example.com");
    const button = screen.getByRole("button", { name: "Sign out" });
    const form = button.closest("form");
    expect(form).toHaveAttribute("method", "post");
    expect(form).toHaveAttribute("action", "/session");
    expect(form?.querySelector<HTMLInputElement>('input[name="_method"]')?.value).toBe("delete");
    expect(form?.querySelector<HTMLInputElement>('input[name="authenticity_token"]')?.value).toBe("csrf-test-token");
    expect(screen.getByRole("link", { name: "Account" })).toHaveAttribute("href", "/account");
  });

  it("sends a signed-out library load back to sign in", async () => {
    window.history.pushState({}, "", "/items/5?view=list&tags=brand");
    const assign = vi.spyOn(navigation, "assign").mockImplementation(() => undefined);
    stubFetch(() => jsonResponse({ error: "Sign in required" }, 401));

    renderApp("/items/5?view=list&tags=brand");

    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith(
        `/sign-in?return_to=${encodeURIComponent("/items/5?view=list&tags=brand")}`,
      );
    });
  });

  it("keeps a typed swatch when a save is signed out", async () => {
    const assign = vi.spyOn(navigation, "assign").mockImplementation(() => undefined);
    stubFetch((_url, init) => {
      if ((init?.method ?? "GET") === "POST") return jsonResponse({ error: "Sign in required" }, 401);
      return jsonResponse({ items: [], next_cursor: null, total_count: 0, ignored_tags: [] });
    });

    renderApp("/items/new");
    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: "Kept title" } });
    fireEvent.click(screen.getByRole("button", { name: "Save swatch" }));

    expect(await screen.findByText(/You were signed out/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in again in a new tab" })).toHaveAttribute(
      "href",
      "/sign-in?return_to=/",
    );
    expect(screen.getByRole("link", { name: "Sign in again in a new tab" })).toHaveAttribute("target", "_blank");
    expect(screen.getByLabelText(/Title/)).toHaveValue("Kept title");
    expect(assign).not.toHaveBeenCalled();
  });
});
