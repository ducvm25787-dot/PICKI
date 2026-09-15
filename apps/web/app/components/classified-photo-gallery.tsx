"use client";

import { useState } from "react";
import { ImageLightbox } from "./image-lightbox";

type Props = {
  photos: string[];
  alt: string;
};

export function ClassifiedPhotoGallery({ photos, alt }: Props) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  if (photos.length === 0) return null;

  return (
    <>
      <div className="classified-photo-gallery">
        {photos.map((src) => (
          <button
            key={src}
            type="button"
            className="classified-photo-gallery-btn"
            onClick={() => setLightboxSrc(src)}
            aria-label={`Xem ảnh: ${alt}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={alt} className="classified-photo-gallery-img" />
          </button>
        ))}
      </div>
      {lightboxSrc ? (
        <ImageLightbox src={lightboxSrc} alt={alt} onClose={() => setLightboxSrc(null)} />
      ) : null}
    </>
  );
}
