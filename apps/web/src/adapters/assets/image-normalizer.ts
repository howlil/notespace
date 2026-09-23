const MAX_ASSET_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 2560;

export async function normalizeImageBlob(source: Blob) {
  if (!source.type.startsWith("image/")) throw new Error("Only image files can be pasted.");

  let normalized = source;
  if (typeof createImageBitmap === "function" && typeof document !== "undefined") {
    try {
      const bitmap = await createImageBitmap(source);
      const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height));
      if (scale < 1 || source.size > MAX_ASSET_BYTES) {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const compressed = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/webp", 0.86));
        if (compressed && (scale < 1 || compressed.size < source.size)) normalized = compressed;
      }
      bitmap.close();
    } catch {
      // Keep the original blob when a browser cannot decode the clipboard image.
    }
  }

  if (normalized.size > MAX_ASSET_BYTES) {
    throw new Error("This image is larger than the 8 MiB asset limit.");
  }
  return normalized;
}
