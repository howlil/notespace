const MAX_ASSET_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 2560;
const DEFAULT_SVG_DIMENSION = 256;
const MIN_SVG_RASTER_DIMENSION = 128;

function isSvgMimeType(mimeType: string) {
  return /^image\/svg\b/i.test(mimeType.trim());
}

function prepareSvgMarkup(svgText: string): { markup: string; width: number; height: number } {
  let width = 0;
  let height = 0;
  const svgTagMatch = svgText.match(/<svg\b[^>]*>/i);
  if (svgTagMatch) {
    const tag = svgTagMatch[0];
    const widthMatch = tag.match(/\bwidth\s*=\s*["']\s*([0-9]+(?:\.[0-9]+)?)\s*(?:px)?\s*["']/i);
    const heightMatch = tag.match(/\bheight\s*=\s*["']\s*([0-9]+(?:\.[0-9]+)?)\s*(?:px)?\s*["']/i);
    if (widthMatch) width = Number(widthMatch[1]);
    if (heightMatch) height = Number(heightMatch[1]);
    if (!(width > 0 && height > 0)) {
      const viewBoxMatch = tag.match(/\bviewBox\s*=\s*["']\s*[-+0-9.]+\s+[-+0-9.]+\s+([0-9]+(?:\.[0-9]+)?)\s+([0-9]+(?:\.[0-9]+)?)\s*["']/i);
      if (viewBoxMatch) {
        if (!(width > 0)) width = Number(viewBoxMatch[1]);
        if (!(height > 0)) height = Number(viewBoxMatch[2]);
      }
    }
  }
  if (!(width > 0)) width = DEFAULT_SVG_DIMENSION;
  if (!(height > 0)) height = DEFAULT_SVG_DIMENSION;

  const maxDim = Math.max(width, height);
  const scale = maxDim < MIN_SVG_RASTER_DIMENSION
    ? MIN_SVG_RASTER_DIMENSION / maxDim
    : Math.min(1, MAX_IMAGE_DIMENSION / maxDim);
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));

  let markup = svgText;
  if (svgTagMatch) {
    let tag = svgTagMatch[0];
    if (!/\bxmlns\s*=/i.test(tag)) {
      tag = tag.replace(/^<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    if (/\bwidth\s*=\s*["'][^"']*["']/i.test(tag)) {
      tag = tag.replace(/\bwidth\s*=\s*["'][^"']*["']/i, `width="${targetWidth}"`);
    } else {
      tag = tag.replace(/^<svg\b/i, `<svg width="${targetWidth}"`);
    }
    if (/\bheight\s*=\s*["'][^"']*["']/i.test(tag)) {
      tag = tag.replace(/\bheight\s*=\s*["'][^"']*["']/i, `height="${targetHeight}"`);
    } else {
      tag = tag.replace(/^<svg\b/i, `<svg height="${targetHeight}"`);
    }
    markup = svgText.replace(svgTagMatch[0], tag);
  }
  return { markup, width: targetWidth, height: targetHeight };
}

type DecodedDrawable = {
  width: number;
  height: number;
  draw: (context: CanvasRenderingContext2D, width: number, height: number) => void;
  close: () => void;
};

async function loadHtmlImage(src: string, widthHint?: number, heightHint?: number): Promise<HTMLImageElement> {
  const image = new Image();
  if (widthHint && widthHint > 0) image.width = widthHint;
  if (heightHint && heightHint > 0) image.height = heightHint;
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const fail = () => {
      if (settled) return;
      settled = true;
      reject(new Error("Could not decode image."));
    };
    image.onload = done;
    image.onerror = fail;
    image.src = src;
    if (typeof image.decode === "function") {
      image.decode().then(done, () => {
        // Wait for onload/onerror if decode() rejects before SVG load completes.
      });
    }
  });
  return image;
}

async function decodeDrawable(source: Blob, isSvg: boolean): Promise<DecodedDrawable | null> {
  let preparedSvg: { markup: string; width: number; height: number } | null = null;
  let blobToDecode = source;
  if (isSvg && typeof source.text === "function") {
    try {
      preparedSvg = prepareSvgMarkup(await source.text());
      blobToDecode = new Blob([preparedSvg.markup], { type: "image/svg+xml;charset=utf-8" });
    } catch {
      preparedSvg = null;
    }
  }
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blobToDecode);
      return {
        width: bitmap.width || preparedSvg?.width || (isSvg ? DEFAULT_SVG_DIMENSION : 1),
        height: bitmap.height || preparedSvg?.height || (isSvg ? DEFAULT_SVG_DIMENSION : 1),
        draw: (context, width, height) => context.drawImage(bitmap, 0, 0, width, height),
        close: () => bitmap.close(),
      };
    } catch {
      if (!isSvg) return null;
    }
  }
  if (typeof Image === "function") {
    if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
      const objectUrl = URL.createObjectURL(blobToDecode);
      try {
        const image = await loadHtmlImage(objectUrl, preparedSvg?.width, preparedSvg?.height);
        return {
          width: image.naturalWidth || preparedSvg?.width || image.width || DEFAULT_SVG_DIMENSION,
          height: image.naturalHeight || preparedSvg?.height || image.height || DEFAULT_SVG_DIMENSION,
          draw: (context, width, height) => context.drawImage(image, 0, 0, width, height),
          close: () => URL.revokeObjectURL(objectUrl),
        };
      } catch {
        URL.revokeObjectURL(objectUrl);
      }
    }
    if (isSvg) {
      try {
        const svgText = preparedSvg ? preparedSvg.markup : await source.text();
        const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
        const image = await loadHtmlImage(dataUrl, preparedSvg?.width, preparedSvg?.height);
        return {
          width: image.naturalWidth || preparedSvg?.width || image.width || DEFAULT_SVG_DIMENSION,
          height: image.naturalHeight || preparedSvg?.height || image.height || DEFAULT_SVG_DIMENSION,
          draw: (context, width, height) => context.drawImage(image, 0, 0, width, height),
          close: () => {},
        };
      } catch {
        return null;
      }
    }
  }
  return null;
}

export async function normalizeImageBlob(source: Blob) {
  if (!source.type.startsWith("image/")) throw new Error("Only image files can be pasted.");

  const isSvg = isSvgMimeType(source.type);
  let normalized = source;
  if (typeof document !== "undefined") {
    const decoded = await decodeDrawable(source, isSvg);
    if (decoded) {
      try {
        const maxSourceDim = Math.max(1, decoded.width, decoded.height);
        const scale = isSvg && maxSourceDim < MIN_SVG_RASTER_DIMENSION
          ? MIN_SVG_RASTER_DIMENSION / maxSourceDim
          : Math.min(1, MAX_IMAGE_DIMENSION / maxSourceDim);
        if (isSvg || scale < 1 || source.size > MAX_ASSET_BYTES) {
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(decoded.width * scale));
          canvas.height = Math.max(1, Math.round(decoded.height * scale));
          const context = canvas.getContext("2d");
          if (context) {
            decoded.draw(context, canvas.width, canvas.height);
            let compressed = await new Promise<Blob | null>((resolve) =>
              canvas.toBlob(resolve, "image/webp", 0.86));
            if (isSvg && (!compressed || isSvgMimeType(compressed.type))) {
              compressed = await new Promise<Blob | null>((resolve) =>
                canvas.toBlob(resolve, "image/png"));
            }
            if (compressed && (isSvg || scale < 1 || compressed.size < source.size)) {
              normalized = compressed;
            }
          }
        }
      } finally {
        decoded.close();
      }
    }
  }

  if (isSvgMimeType(normalized.type)) {
    throw new Error("SVG images cannot be stored without rasterization.");
  }
  if (normalized.size > MAX_ASSET_BYTES) {
    throw new Error("This image is larger than the 8 MiB asset limit.");
  }
  return normalized;
}
