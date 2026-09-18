const MAX_BYTES = 300 * 1024;
const MAX_EDGE = 1200;

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Không nén được ảnh"));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      quality,
    );
  });
}

async function compressBitmap(
  source: CanvasImageSource,
  width: number,
  height: number,
  maxBytes: number,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Trình duyệt không hỗ trợ xử lý ảnh");
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);

  let quality = 0.82;
  let blob = await canvasToJpegBlob(canvas, quality);
  while (blob.size > maxBytes && quality > 0.35) {
    quality -= 0.08;
    blob = await canvasToJpegBlob(canvas, quality);
  }

  if (blob.size <= maxBytes) {
    return blob;
  }

  let scale = 0.85;
  while (scale > 0.35) {
    const w = Math.max(320, Math.round(width * scale));
    const h = Math.max(320, Math.round(height * scale));
    canvas.width = w;
    canvas.height = h;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(source, 0, 0, w, h);
    blob = await canvasToJpegBlob(canvas, 0.72);
    if (blob.size <= maxBytes) {
      return blob;
    }
    scale -= 0.12;
  }

  throw new Error("Ảnh quá lớn — chọn ảnh khác hoặc cắt nhỏ hơn");
}

/** Nén ảnh trên máy user xuống dưới 300KB trước khi upload. */
export async function compressImageFile(file: File, maxBytes = MAX_BYTES): Promise<Blob> {
  if (file.type && !file.type.startsWith("image/")) {
    throw new Error("Chỉ chọn file ảnh (JPG/PNG/WebP)");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // HEIC / corrupt / unsupported — try via <img> + object URL
    bitmap = await loadBitmapViaImageElement(file);
  }

  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    return await compressBitmap(bitmap, width, height, maxBytes);
  } finally {
    bitmap.close();
  }
}

async function loadBitmapViaImageElement(file: File): Promise<ImageBitmap> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Không đọc được ảnh — thử xuất lại JPG"));
      el.src = url;
    });
    return await createImageBitmap(img);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function formatImageSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${Math.round(bytes / 1024)} KB`;
}

export const CLASSIFIED_MAX_PHOTOS = 3;
export const CLASSIFIED_MAX_PHOTO_BYTES = MAX_BYTES;
