import { useState } from "react";

export function useLightbox() {
  const [index, setIndex] = useState<number | null>(null);
  return { index, open: setIndex, close: () => setIndex(null) };
}

export function GalleryLightbox({ images, index, onClose, onNavigate }: { images: { url: string }[]; index: number; onClose: () => void; onNavigate: (i: number) => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.9)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
      }}
    >
      {index > 0 && (
        <button
          className="btn"
          style={{ position: "absolute", left: "1rem", fontSize: "1.5rem" }}
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(index - 1);
          }}
        >
          ‹
        </button>
      )}
      <img src={images[index].url} alt="" style={{ maxWidth: "90vw", maxHeight: "90vh", objectFit: "contain" }} />
      {index < images.length - 1 && (
        <button
          className="btn"
          style={{ position: "absolute", right: "1rem", fontSize: "1.5rem" }}
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(index + 1);
          }}
        >
          ›
        </button>
      )}
    </div>
  );
}
