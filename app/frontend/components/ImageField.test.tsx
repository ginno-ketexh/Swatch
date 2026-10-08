import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Item } from "../api/types";
import { ImagePrepareError, type PreparedImage } from "../lib/prepareImage";
import { ImageField } from "./ImageField";

const image = {
  alt: null,
  width: 400,
  height: 300,
  content_type: "image/webp",
  byte_size: 800,
  version: 3,
  urls: {
    card: "/api/v1/items/7/image/card?v=3",
    card_2x: "/api/v1/items/7/image/card_2x?v=3",
    large: "/api/v1/items/7/image/large?v=3",
  },
};

const swatch: Item = {
  id: 7,
  title: "Terracotta stair",
  source_url: null,
  source_domain: null,
  notes: "Keep the notes",
  color: "#7C2D24",
  created_at: "2026-10-08T00:00:00Z",
  image: null,
};

function prepared(color: string | null = "#A65A3C"): PreparedImage {
  return {
    file: new File([new Uint8Array([1, 2, 3])], "swatch.webp", { type: "image/webp" }),
    previewUrl: "blob:preview",
    color,
  };
}

class FakeXHR {
  static instances: FakeXHR[] = [];
  status = 200;
  responseText = "{}";
  upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  sent: FormData | null = null;
  headers: Record<string, string> = {};

  open() {}
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  abort() {
    this.onabort?.();
  }
  send(body: FormData) {
    this.sent = body;
    FakeXHR.instances.push(this);
  }
}

function renderField(options: {
  item?: Item;
  enabled?: boolean;
  prepare?: (file: File) => Promise<PreparedImage>;
  onSuggestColor?: (hex: string) => void;
  onNotice?: (message: string, tone: "success" | "error") => void;
} = {}) {
  const notices: string[] = [];
  const changes: Item[] = [];
  const suggestions: string[] = [];
  function Host() {
    const [item, setItem] = useState(options.item ?? swatch);
    return (
      <div data-image-scope="">
        <ImageField
          enabled={options.enabled ?? true}
          item={item}
          itemId={item.id}
          itemTitle={item.title}
          prepare={options.prepare ?? (async () => prepared())}
          onChange={(next) => {
            changes.push(next);
            setItem(next);
          }}
          onDirty={() => undefined}
          onSuggestColor={(hex) => {
            suggestions.push(hex);
            options.onSuggestColor?.(hex);
          }}
          onNotice={(message, tone) => {
            notices.push(`${tone}:${message}`);
            options.onNotice?.(message, tone);
          }}
        />
      </div>
    );
  }
  render(<Host />);
  return { notices, changes, suggestions };
}

function pngFile(name = "stair.png"): File {
  return new File([new Uint8Array([137, 80, 78, 71])], name, { type: "image/png" });
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeXHR.instances = [];
  vi.restoreAllMocks();
});

describe("ImageField", () => {
  it("shows a calm notice when uploads are turned off", () => {
    renderField({ enabled: false });
    expect(screen.getByText(/Image uploads aren't set up yet/)).toBeInTheDocument();
    expect(screen.getByText(/docs\/DEPLOY_RENDER.md/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Choose an image" })).not.toBeInTheDocument();
  });

  it("accepts a file from the keyboard picker and announces throttled progress", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXHR);
    renderField();

    fireEvent.click(screen.getByRole("button", { name: "Choose an image" }));
    fireEvent.change(screen.getByLabelText("Choose an image"), { target: { files: [pngFile()] } });

    expect(await screen.findByRole("presentation")).toHaveAttribute("src", "blob:preview");
    const xhr = FakeXHR.instances[0];
    expect(xhr).toBeTruthy();
    const live = () => document.querySelector("[aria-live=polite]");
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 10, total: 100 } as ProgressEvent);
    await waitFor(() => expect(live()?.textContent).toBe("Uploading 10%"));
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 20, total: 100 } as ProgressEvent);
    expect(live()?.textContent).toBe("Uploading 10%");
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 40, total: 100 } as ProgressEvent);
    await waitFor(() => expect(live()?.textContent).toBe("Uploading 40%"));
    expect(screen.getAllByText("Uploading 40%").length).toBeGreaterThan(0);

    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 100, total: 100 } as ProgressEvent);
    expect(await screen.findByText("Processing…")).toBeInTheDocument();
    xhr.status = 200;
    xhr.responseText = JSON.stringify({ ...swatch, image });
    xhr.onload?.();
    await waitFor(() => {
      const announced = [...document.querySelectorAll("[aria-live=polite]")].some((node) => node.textContent === "Image added");
      expect(announced).toBe(true);
    });
  });

  it("marks drag-over without relying on colour alone", () => {
    renderField();
    const zone = document.querySelector(".dropzone");
    expect(zone).toBeTruthy();
    fireEvent.dragEnter(zone as Element);
    expect(zone).toHaveClass("dropzone-active");
    expect(screen.getByText("Drop the image to add it")).toBeInTheDocument();
  });

  it("pastes an image and uses only the first of several files", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXHR);
    const calls: File[] = [];
    renderField({
      prepare: async (file) => {
        calls.push(file);
        return prepared();
      },
    });
    const button = screen.getByRole("button", { name: "Choose an image" });
    button.focus();
    fireEvent.paste(button, { clipboardData: { files: [pngFile("pasted.png")] } });
    await waitFor(() => expect(calls.map((file) => file.name)).toEqual(["pasted.png"]));

    const zone = document.querySelector(".dropzone") as Element;
    fireEvent.drop(zone, { dataTransfer: { files: [pngFile("one.png"), pngFile("two.png")] } });
    expect(await screen.findByText("Only one image per swatch. Used the first one.")).toBeInTheDocument();
    expect(calls.map((file) => file.name)).toEqual(["pasted.png", "one.png"]);
  });

  it("explains a wrong type and offers retry with the same shrunk file", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXHR);
    const file = prepared().file;
    let prepares = 0;
    renderField({
      prepare: async () => {
        prepares += 1;
        if (prepares === 1) throw new ImagePrepareError("Swatch accepts JPEG, PNG, WebP or GIF images");
        return { ...prepared(), file };
      },
    });

    fireEvent.change(screen.getByLabelText("Choose an image"), { target: { files: [pngFile("notes.html")] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Swatch accepts JPEG, PNG, WebP or GIF images");

    fireEvent.change(screen.getByLabelText("Choose an image"), { target: { files: [pngFile()] } });
    await waitFor(() => expect(FakeXHR.instances).toHaveLength(1));
    const first = FakeXHR.instances[0];
    first.status = 503;
    first.responseText = JSON.stringify({ error: "The image could not be uploaded. Check your connection and try again." });
    first.onload?.();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("The image could not be uploaded"));

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(FakeXHR.instances).toHaveLength(2));
    expect(prepares).toBe(2);
    expect(FakeXHR.instances[1].sent?.get("image")).toBe(file);
  });

  it("keeps the preview when the upload fails and restores an image if removal fails", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXHR);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "nope" }), { status: 500 })));
    const withImage = { ...swatch, image: { ...image, alt: "A worn stair" } };
    renderField({ item: withImage });

    fireEvent.change(screen.getByLabelText("Replace image for Terracotta stair"), { target: { files: [pngFile()] } });
    expect(await screen.findByRole("presentation")).toHaveAttribute("src", "blob:preview");
    const xhr = FakeXHR.instances[0];
    xhr.status = 0;
    xhr.onerror?.();
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be uploaded");
    expect(screen.getByRole("presentation")).toHaveAttribute("src", "blob:preview");

    fireEvent.click(screen.getByRole("button", { name: "Remove image for Terracotta stair" }));
    expect(screen.getByRole("dialog", { name: "Remove this image?" })).toBeInTheDocument();
    expect(screen.getByText("The swatch and its notes stay.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove image" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not remove the image.");
    expect(screen.getByRole("button", { name: "View larger" })).toBeInTheDocument();
  });

  it("opens the lightbox and returns focus to View larger", async () => {
    const withImage = { ...swatch, image: { ...image, alt: "A worn stair" } };
    renderField({ item: withImage });
    const opener = screen.getByRole("button", { name: "View larger" });
    fireEvent.click(opener);
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("A worn stair");
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("does not apply a colour suggestion until the chip is clicked", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXHR);
    const { suggestions } = renderField({ item: { ...swatch, color: null } });
    fireEvent.change(screen.getByLabelText("Choose an image"), { target: { files: [pngFile()] } });
    const chip = await screen.findByRole("button", { name: "Use colour from image #A65A3C" });
    expect(suggestions).toEqual([]);
    const suggestion = [...document.querySelectorAll("[aria-live=polite]")].some((node) => node.textContent === "Colour suggestion available: #A65A3C");
    expect(suggestion).toBe(true);
    fireEvent.click(chip);
    expect(suggestions).toEqual(["#A65A3C"]);
    expect(screen.queryByRole("button", { name: /Use colour from image/ })).not.toBeInTheDocument();
  });

  it("offers to replace a colour that is already set and can dismiss the suggestion", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXHR);
    renderField();
    fireEvent.change(screen.getByLabelText("Choose an image"), { target: { files: [pngFile()] } });
    expect(await screen.findByRole("button", { name: "Replace colour with #A65A3C" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "No thanks" }));
    expect(screen.queryByRole("button", { name: /Replace colour/ })).not.toBeInTheDocument();
  });
});
