import { describe, expect, it } from "vitest";
import { dominantColorFromPixels, type Pixel } from "./dominantColor";

function fill(count: number, pixel: Pixel): Pixel[] {
  return Array.from({ length: count }, () => ({ ...pixel }));
}

describe("dominantColorFromPixels", () => {
  it("averages a solid colour", () => {
    const pixels = fill(8, { r: 166, g: 90, b: 60, a: 255 });
    expect(dominantColorFromPixels(pixels)).toBe("#A65A3C");
  });

  it("picks the larger of two tones", () => {
    const pixels = [
      ...fill(3, { r: 10, g: 10, b: 10, a: 255 }),
      ...fill(9, { r: 200, g: 40, b: 40, a: 255 }),
    ];
    expect(dominantColorFromPixels(pixels)).toBe("#C82828");
  });

  it("ignores nearly transparent edges", () => {
    const pixels = [
      ...fill(6, { r: 0, g: 255, b: 0, a: 0 }),
      ...fill(4, { r: 166, g: 90, b: 60, a: 255 }),
    ];
    expect(dominantColorFromPixels(pixels)).toBe("#A65A3C");
  });

  it("still returns a hex when every pixel is transparent", () => {
    const pixels = fill(4, { r: 16, g: 32, b: 64, a: 0 });
    expect(dominantColorFromPixels(pixels)).toBe("#102040");
  });
});
