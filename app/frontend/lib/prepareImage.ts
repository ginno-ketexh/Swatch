import { dominantColorFromPixels, type Pixel } from "./dominantColor";

export type PreparedImage = {
  file: File;
  previewUrl: string;
  color: string | null;
};

const MAX_INPUT = 25 * 1024 * 1024;
const MAX_GIF = 10 * 1024 * 1024;
const MAX_UPLOAD = 10 * 1024 * 1024;
const LONG_EDGE = 2560;

export class ImagePrepareError extends Error {}

export async function sniffImage(file: Blob): Promise<"jpeg" | "png" | "webp" | "gif" | null> {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "gif";
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "webp";
  }
  return null;
}

export async function prepareImageFile(file: File): Promise<PreparedImage> {
  const kind = await sniffImage(file);
  if (!kind) throw new ImagePrepareError("Swatch accepts JPEG, PNG, WebP or GIF images");
  if (kind === "gif") {
    if (file.size > MAX_GIF) throw new ImagePrepareError("That file is bigger than 10 MB");
    const previewUrl = URL.createObjectURL(file);
    return { file, previewUrl, color: await colorFromFile(file) };
  }
  if (file.size > MAX_INPUT) throw new ImagePrepareError("That file is bigger than 25 MB. Choose a smaller one.");

  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, LONG_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new ImagePrepareError("We couldn't read that image");
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await encodeCanvas(canvas);
    if (blob.size > MAX_UPLOAD) throw new ImagePrepareError("That file is bigger than 10 MB");
    const shrunk = new File([blob], "swatch.webp", { type: blob.type });
    const previewUrl = URL.createObjectURL(shrunk);
    return { file: shrunk, previewUrl, color: colorFromCanvas(canvas) };
  } finally {
    bitmap.close();
  }
}

async function encodeCanvas(canvas: HTMLCanvasElement): Promise<Blob> {
  const webp = await canvasBlob(canvas, "image/webp", 0.8);
  if (webp && webp.type === "image/webp") return webp;
  const type = canvasHasTransparency(canvas) ? "image/png" : "image/jpeg";
  const fallback = await canvasBlob(canvas, type, 0.85);
  if (!fallback) throw new ImagePrepareError("We couldn't read that image");
  return fallback;
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), type, quality));
}

function canvasHasTransparency(canvas: HTMLCanvasElement): boolean {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return false;
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] < 250) return true;
  }
  return false;
}

function colorFromCanvas(canvas: HTMLCanvasElement): string | null {
  const sample = document.createElement("canvas");
  sample.width = 64;
  sample.height = 64;
  const context = sample.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(canvas, 0, 0, 64, 64);
  return dominantColorFromPixels(pixelsFrom(context.getImageData(0, 0, 64, 64).data));
}

async function colorFromFile(file: Blob): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(file);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 64;
      const context = canvas.getContext("2d");
      if (!context) return null;
      context.drawImage(bitmap, 0, 0, 64, 64);
      return colorFromCanvas(canvas);
    } finally {
      bitmap.close();
    }
  } catch {
    return null;
  }
}

function pixelsFrom(data: Uint8ClampedArray): Pixel[] {
  const pixels: Pixel[] = [];
  for (let index = 0; index < data.length; index += 4) {
    pixels.push({ r: data[index] ?? 0, g: data[index + 1] ?? 0, b: data[index + 2] ?? 0, a: data[index + 3] ?? 0 });
  }
  return pixels;
}
