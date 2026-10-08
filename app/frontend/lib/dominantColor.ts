export type Pixel = { r: number; g: number; b: number; a: number };

// Skip nearly invisible pixels, group the rest into a coarse palette,
// and average the largest group. The result is always #RRGGBB uppercase.
export function dominantColorFromPixels(pixels: Pixel[]): string | null {
  if (pixels.length === 0) return null;

  const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();
  const visible = pixels.filter((pixel) => pixel.a >= 16);
  const source = visible.length > 0 ? visible : pixels;

  for (const pixel of source) {
    const r = Math.round(pixel.r / 32) * 32;
    const g = Math.round(pixel.g / 32) * 32;
    const b = Math.round(pixel.b / 32) * 32;
    const key = `${r},${g},${b}`;
    const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    bucket.count += 1;
    bucket.r += pixel.r;
    bucket.g += pixel.g;
    bucket.b += pixel.b;
    buckets.set(key, bucket);
  }

  let winner: { count: number; r: number; g: number; b: number } | null = null;
  for (const bucket of buckets.values()) {
    if (!winner || bucket.count > winner.count) winner = bucket;
  }
  if (!winner || winner.count === 0) return null;

  return toHex(winner.r / winner.count, winner.g / winner.count, winner.b / winner.count);
}

export function toHex(r: number, g: number, b: number): string {
  const channel = (value: number) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0").toUpperCase();
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}
