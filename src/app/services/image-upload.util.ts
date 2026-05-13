/**
 * Browser-only image-resize / base64-encode helper used for profile avatars.
 *
 * D10 = inline base64 in Firestore, so we hard-cap each avatar at ~700KB
 * encoded (leaves headroom under Firestore's 1MB doc limit) and downscale
 * aggressively before encoding to keep most uploads well under that.
 *
 * The function tries successively smaller JPEG qualities + dimensions until
 * the base64 payload fits the budget. Rejects with a clear message if the
 * source image is unusable.
 */

const MAX_DIMENSION = 512;        // square crop, max 512×512 logical pixels
const MAX_BASE64_BYTES = 700_000; // ~700KB encoded
const QUALITY_STEPS = [0.85, 0.7, 0.55, 0.4, 0.3];

const ACCEPTED_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif',
]);

export interface ResizedImage {
  dataUrl: string;
  bytes: number;
}

export async function fileToResizedDataUrl(file: File): Promise<ResizedImage> {
  if (!file) throw new Error('No file selected');
  if (!ACCEPTED_TYPES.has(file.type.toLowerCase())) {
    throw new Error('Unsupported file type. Use JPEG, PNG, WEBP or GIF.');
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('Image is too large. Pick a file under 10MB.');
  }

  const bitmap = await loadBitmap(file);
  try {
    return resizeAndEncode(bitmap);
  } finally {
    bitmap.close?.();
  }
}

// ─── internals ─────────────────────────────────────────────────────────────

async function loadBitmap(file: File): Promise<ImageBitmap> {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file);
  }
  // Fallback for environments without createImageBitmap (older Safari).
  const dataUrl = await readAsDataUrl(file);
  const img = await loadImage(dataUrl);
  // Render via canvas → blob → bitmap (slow path; rarely hit).
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  c.getContext('2d')!.drawImage(img, 0, 0);
  const blob: Blob = await new Promise((resolve, reject) =>
    c.toBlob(b => (b ? resolve(b) : reject(new Error('Canvas encode failed'))), 'image/png'),
  );
  return createImageBitmap(blob);
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(new Error('Could not read file'));
    r.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('Image decode failed'));
    i.src = src;
  });
}

/**
 * Center-crops to a square then downscales to fit within MAX_DIMENSION,
 * iterating JPEG quality (and a fallback dimension step) until the
 * resulting base64 payload meets MAX_BASE64_BYTES.
 */
function resizeAndEncode(bitmap: ImageBitmap): ResizedImage {
  const size = Math.min(bitmap.width, bitmap.height);
  const sx = Math.floor((bitmap.width - size) / 2);
  const sy = Math.floor((bitmap.height - size) / 2);

  const dimensionSteps = [MAX_DIMENSION, 384, 256, 192];

  for (const targetDim of dimensionSteps) {
    const canvas = document.createElement('canvas');
    canvas.width = targetDim;
    canvas.height = targetDim;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, sx, sy, size, size, 0, 0, targetDim, targetDim);

    for (const quality of QUALITY_STEPS) {
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      const bytes = approxBase64Bytes(dataUrl);
      if (bytes <= MAX_BASE64_BYTES) {
        return { dataUrl, bytes };
      }
    }
  }

  throw new Error('Could not compress image small enough — try a smaller picture.');
}

function approxBase64Bytes(dataUrl: string): number {
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex < 0) return dataUrl.length;
  return Math.ceil((dataUrl.length - commaIndex - 1) * 3 / 4);
}

// ─── Generic file → base64 data URL (for learning materials, Addition #3) ──
//
// D14 = inline base64 in Firestore for learning-material files. The encoded
// payload must fit under the same ~700KB budget as avatars. Since base64
// inflates raw bytes by ~33%, the raw file is capped at ~525KB so the
// encoded form stays under MAX_BASE64_BYTES with margin.

const MAX_RAW_FILE_BYTES = 525_000;

export interface EncodedFile {
  dataUrl: string;
  name: string;
  mimeType: string;
  rawSize: number;     // bytes on disk
  encodedSize: number; // bytes after base64
}

export async function fileToBase64DataUrl(file: File): Promise<EncodedFile> {
  if (!file) throw new Error('No file selected');
  if (file.size > MAX_RAW_FILE_BYTES) {
    const limitKB = Math.round(MAX_RAW_FILE_BYTES / 1024);
    throw new Error(
      `File is too large (${formatBytes(file.size)}). The limit is ${limitKB} KB.`,
    );
  }

  const dataUrl = await readAsDataUrl(file);
  const encodedSize = approxBase64Bytes(dataUrl);
  if (encodedSize > MAX_BASE64_BYTES) {
    throw new Error('Encoded file exceeds storage budget. Try a smaller file.');
  }

  return {
    dataUrl,
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    rawSize: file.size,
    encodedSize,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
