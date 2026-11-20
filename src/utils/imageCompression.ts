/**
 * Silently compresses a handwritten order photo captured on a worker's phone
 * down to ~200-400 KB in under 1 second while keeping handwritten digits crystal clear.
 */
export interface CompressedPhotoResult {
  blob: Blob;
  contentType: 'image/webp' | 'image/jpeg';
  width: number;
  height: number;
  originalBytes: number;
  compressedBytes: number;
}

export async function compressOrderPhoto(
  file: File | Blob,
  options?: { maxDimension?: number; targetMaxBytes?: number }
): Promise<CompressedPhotoResult> {
  const maxDim = options?.maxDimension ?? 1650;
  const targetMaxBytes = options?.targetMaxBytes ?? 420 * 1024; // ~420 KB target
  const originalBytes = file.size;

  const bitmap = await loadImageBitmapOrElement(file);
  try {
    const srcW = bitmap.width;
    const srcH = bitmap.height;
    const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
    const width = Math.max(1, Math.round(srcW * scale));
    const height = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context is not available on this device.');
    }

    // Crisp downscaling for handwritten ink clarity
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap.source, 0, 0, width, height);

    // Prefer WebP for best readability-per-kilobyte; fallback to JPEG if browser lacks WebP encoder
    let contentType: 'image/webp' | 'image/jpeg' = 'image/webp';
    let blob = await canvasToBlob(canvas, 'image/webp', 0.80);
    if (!blob || blob.type !== 'image/webp') {
      contentType = 'image/jpeg';
      blob = await canvasToBlob(canvas, 'image/jpeg', 0.80);
    }

    // Step quality down gently only if still above targetMaxBytes (never below 0.58 to keep numbers sharp)
    let quality = 0.72;
    while (blob && blob.size > targetMaxBytes && quality >= 0.58) {
      const nextBlob = await canvasToBlob(canvas, contentType, quality);
      if (nextBlob) {
        blob = nextBlob;
      }
      quality -= 0.07;
    }

    if (!blob) {
      throw new Error('Failed to compress order photo.');
    }

    return {
      blob,
      contentType,
      width,
      height,
      originalBytes,
      compressedBytes: blob.size,
    };
  } finally {
    bitmap.cleanup();
  }
}

async function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((result) => resolve(result), mimeType, quality);
  });
}

async function loadImageBitmapOrElement(file: Blob): Promise<{
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
}> {
  if (typeof createImageBitmap === 'function') {
    const bmp = await createImageBitmap(file);
    return {
      source: bmp,
      width: bmp.width,
      height: bmp.height,
      cleanup: () => bmp.close(),
    };
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not decode image file.'));
      el.src = url;
    });
    return {
      source: img,
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
      cleanup: () => URL.revokeObjectURL(url),
    };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}
