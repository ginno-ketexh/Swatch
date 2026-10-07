import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, renderApp } from "../test/renderApp";

function stubFetch(impl: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    return Promise.resolve(impl(url, init));
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.head.innerHTML = "";
});

describe("ItemForm", () => {
  it("shows a summary and inline errors, then moves focus to the summary", async () => {
    renderApp("/items/new");

    fireEvent.click(screen.getByRole("button", { name: "Save swatch" }));

    const summary = await screen.findByRole("alert");
    expect(summary).toHaveTextContent("Check the highlighted fields.");
    expect(summary).toHaveFocus();
    const title = screen.getByLabelText(/Title/);
    expect(title).toHaveAttribute("aria-invalid", "true");
    expect(title.getAttribute("aria-describedby")).toContain("error");
    expect(screen.getByText("can't be blank")).toBeInTheDocument();
  });

  it("announces the character count after a pause, not on the keystroke", () => {
    vi.useFakeTimers();
    renderApp("/items/new");

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId("title-count-live")).toHaveTextContent("0 of 120 characters");

    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: "Hello" } });
    expect(screen.getByTestId("title-count-live")).toHaveTextContent("0 of 120 characters");
    expect(screen.getByText("5 / 120")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId("title-count-live")).toHaveTextContent("5 of 120 characters");
  });

  it("keeps the colour picker and the hex field in sync", () => {
    renderApp("/items/new");

    fireEvent.change(screen.getByLabelText("Colour picker"), { target: { value: "#123abc" } });
    expect(screen.getByLabelText("Colour")).toHaveValue("#123ABC");

    fireEvent.change(screen.getByLabelText("Colour"), { target: { value: "#aabbcc" } });
    expect(screen.getByLabelText("Colour picker")).toHaveValue("#aabbcc");

    fireEvent.click(screen.getByRole("button", { name: "Clear colour" }));
    expect(screen.getByLabelText("Colour")).toHaveValue("");
  });

  it("rejects a javascript link before saving", async () => {
    renderApp("/items/new");

    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: "Bad link" } });
    fireEvent.change(screen.getByLabelText("Source link"), { target: { value: "JavaScript:alert(1)" } });
    fireEvent.click(screen.getByRole("button", { name: "Save swatch" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("must be an http or https URL");
  });

  it("shows Saving… and sends the csrf token once", async () => {
    document.head.innerHTML = '<meta name="csrf-token" content="test-token" />';
    const calls: RequestInit[] = [];
    stubFetch((_url, init) => {
      if (init) calls.push(init);
      return new Promise(() => {}) as unknown as Response;
    });
    renderApp("/items/new");

    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: "Lamp" } });
    fireEvent.click(screen.getByRole("button", { name: "Save swatch" }));
    fireEvent.click(screen.getByRole("button", { name: "Saving…" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled());
    expect(calls).toHaveLength(1);
    expect(new Headers(calls[0].headers).get("X-CSRF-Token")).toBe("test-token");
  });

  it("keeps notes as text in the field", () => {
    renderApp("/items/new");

    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "<img src=x onerror=alert(1)>" } });

    expect(screen.getByLabelText("Notes")).toHaveValue("<img src=x onerror=alert(1)>");
    expect(screen.getByLabelText("Notes").querySelector("img")).toBeNull();
  });

  it("warns before leaving with unsaved changes", async () => {
    stubFetch(() => jsonResponse({ items: [], next_cursor: null }));
    renderApp("/items/new");

    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: "Unsaved" } });
    fireEvent.click(screen.getByRole("link", { name: "Back to library" }));

    expect(await screen.findByRole("heading", { name: "Discard unsaved changes?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Stay" }));
    expect(screen.getByLabelText(/Title/)).toHaveValue("Unsaved");
    expect(screen.queryByRole("heading", { name: "Your swatches" })).not.toBeInTheDocument();
  });

  it("shows a friendly message when the swatch to edit is gone", async () => {
    stubFetch(() => jsonResponse({ error: "Not found" }, 404));
    renderApp("/items/9/edit");

    expect(await screen.findByRole("heading", { name: "This swatch is not in your library." })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save swatch" })).not.toBeInTheDocument();
  });
});
