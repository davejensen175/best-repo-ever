"use client";

import { createClient } from "@/lib/supabase/client";
import { MEDIA_BUCKET } from "@/lib/media";

/** Downscales an image so its longest edge is at most maxEdge, re-encoding it (JPEG by default). */
export async function resizeImage(file: Blob, maxEdge: number, type: "image/jpeg" | "image/png" = "image/jpeg"): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvasToBlob(canvas, type, type === "image/jpeg" ? 0.85 : undefined);
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode image."))), type, quality),
  );
}

/** Renders the first page of a PDF floor plan to a PNG. */
export async function pdfToPng(file: File, maxEdge = 2400): Promise<Blob> {
  // The legacy build supports current evergreen browsers; the default build needs very new JS features.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  const task = pdfjs.getDocument({ data: await file.arrayBuffer() });
  const pdf = await task.promise;
  try {
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: maxEdge / Math.max(base.width, base.height) });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvas, viewport, background: "#ffffff" }).promise;
    return canvasToBlob(canvas, "image/png");
  } finally {
    await task.destroy();
  }
}

/** Uploads a blob to <userId>/<propertyId>/<random>.<ext> and returns the object path. */
export async function uploadMedia(userId: string, propertyId: string, blob: Blob, ext: "jpg" | "png") {
  const path = `${userId}/${propertyId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await createClient()
    .storage.from(MEDIA_BUCKET)
    .upload(path, blob, { contentType: ext === "png" ? "image/png" : "image/jpeg", cacheControl: "31536000" });
  if (error) throw new Error(error.message);
  return path;
}
