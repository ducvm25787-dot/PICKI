"use client";

import { useRef, useState } from "react";
import {
  CLASSIFIED_MAX_PHOTOS,
  CLASSIFIED_MAX_PHOTO_BYTES,
  compressImageFile,
  formatImageSize,
} from "../../lib/compress-image";
import { api } from "../../lib/api";

export type ClassifiedPhoto = {
  url: string;
  previewUrl: string;
  sizeLabel: string;
};

type Props = {
  photos: ClassifiedPhoto[];
  onChange: (photos: ClassifiedPhoto[]) => void;
  disabled?: boolean;
  maxPhotos?: number;
};

export function ClassifiedPhotoPicker({
  photos,
  onChange,
  disabled = false,
  maxPhotos = CLASSIFIED_MAX_PHOTOS,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const remaining = maxPhotos - photos.length;
    if (remaining <= 0) {
      setError(`Tối đa ${String(maxPhotos)} ảnh`);
      return;
    }

    const files = Array.from(fileList).slice(0, remaining);
    setUploading(true);
    setError(null);

    try {
      const next = [...photos];
      for (const file of files) {
        const compressed = await compressImageFile(file, CLASSIFIED_MAX_PHOTO_BYTES);
        const dataUrl = await blobToDataUrl(compressed);
        const uploaded = await api<{ url: string }>("/classifieds/photos", {
          method: "POST",
          body: JSON.stringify({ dataUrl }),
        });
        next.push({
          url: uploaded.url,
          previewUrl: uploaded.url,
          sizeLabel: formatImageSize(compressed.size),
        });
      }
      onChange(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được ảnh");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function removeAt(index: number) {
    onChange(photos.filter((_, i) => i !== index));
  }

  return (
    <div className="classified-photo-picker">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span>Ảnh (tối đa {maxPhotos}, mỗi ảnh &lt; 300KB)</span>
        <span className="stat">
          {photos.length}/{maxPhotos}
        </span>
      </div>

      <div className="classified-photo-grid">
        {photos.map((photo, index) => (
          <div key={photo.url} className="classified-photo-thumb-wrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.previewUrl} alt="" className="classified-photo-thumb" />
            <span className="classified-photo-size">{photo.sizeLabel}</span>
            <button
              type="button"
              className="classified-photo-remove"
              disabled={disabled || uploading}
              onClick={() => removeAt(index)}
              aria-label="Xóa ảnh"
            >
              ✕
            </button>
          </div>
        ))}

        {photos.length < maxPhotos ? (
          <button
            type="button"
            className="classified-photo-add"
            disabled={disabled || uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? "Đang nén…" : "+ Thêm ảnh"}
          </button>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/*"
        multiple={maxPhotos > 1}
        hidden
        onChange={(e) => void handleFiles(e.target.files)}
      />

      {error ? <p className="stat" style={{ color: "#c0392b", marginTop: 8 }}>{error}</p> : null}
      <p className="stat" style={{ marginTop: 8 }}>
        Ảnh được nén trên máy bạn trước khi gửi lên Pickee.
      </p>
    </div>
  );
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Không đọc được ảnh"));
    };
    reader.onerror = () => reject(new Error("Không đọc được ảnh"));
    reader.readAsDataURL(blob);
  });
}
