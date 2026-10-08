import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Item } from "../api/types";
import { CoverImage } from "./CoverImage";

const item: Item = {
  id: 4,
  title: "Terracotta stair",
  source_url: null,
  source_domain: null,
  notes: null,
  color: "#7C2D24",
  created_at: "2026-10-08T00:00:00Z",
  image: {
    alt: "A worn stair",
    width: 800,
    height: 600,
    content_type: "image/webp",
    byte_size: 1200,
    version: 9,
    urls: {
      card: "/api/v1/items/4/image/card?v=9",
      card_2x: "/api/v1/items/4/image/card_2x?v=9",
      large: "/api/v1/items/4/image/large?v=9",
    },
  },
};

describe("CoverImage", () => {
  it("is decorative and uses the card variants", () => {
    render(<CoverImage item={item} view="grid" eager />);
    const image = screen.getByRole("presentation");
    expect(image).toHaveAttribute("alt", "");
    expect(image).toHaveAttribute("src", "/api/v1/items/4/image/card?v=9");
    expect(image.getAttribute("srcset")).toContain("400w");
    expect(image.getAttribute("srcset")).toContain("800w");
    expect(image).toHaveAttribute("loading", "eager");
  });

  it("uses a square thumbnail in the list", () => {
    render(<CoverImage item={item} view="list" eager={false} />);
    const image = screen.getByRole("presentation");
    expect(image).toHaveAttribute("loading", "lazy");
    expect(image).not.toHaveAttribute("srcset");
  });

  it("retries once and then says the image is unavailable", () => {
    render(<CoverImage item={item} view="grid" eager />);
    const image = screen.getByRole("presentation");
    fireEvent.error(image);
    const retried = screen.getByRole("presentation");
    expect(retried.getAttribute("src")).toContain("retry=1");
    fireEvent.error(retried);
    expect(screen.getByText("Image unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("presentation")).not.toBeInTheDocument();
  });
});
