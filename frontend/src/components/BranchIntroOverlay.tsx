import { useEffect, useRef, useState } from "react";

interface Props {
  gifUrl: string;
  voiceoverUrl: string | null;
  text: string | null;
  onDone: () => void;
}

export function BranchIntroOverlay({ gifUrl, voiceoverUrl, text, onDone }: Props) {
  const [visible, setVisible] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    // Fade in on mount, then start the voiceover once the fade has visibly begun.
    const t = setTimeout(() => setVisible(true), 20);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (visible && voiceoverUrl) {
      audioRef.current?.play().catch(() => {});
    }
  }, [visible, voiceoverUrl]);

  function dismiss() {
    setVisible(false);
    setTimeout(onDone, 300); // let the fade-out finish before unmounting
  }

  return (
    <div
      onClick={dismiss}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(6, 9, 17, 0.88)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1.2rem",
        cursor: "pointer",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.3s ease",
      }}
    >
      <img
        src={gifUrl}
        alt="Guide"
        style={{
          maxWidth: 280,
          maxHeight: 280,
          borderRadius: "var(--radius)",
          boxShadow: "0 0 40px var(--accent-audio)",
          transform: visible ? "scale(1)" : "scale(0.9)",
          transition: "transform 0.3s ease",
        }}
      />
      {text && <p style={{ maxWidth: 560, textAlign: "center", fontSize: "1rem", color: "var(--text)", padding: "0 1rem" }}>{text}</p>}
      {voiceoverUrl && <audio ref={audioRef} src={voiceoverUrl} onEnded={dismiss} />}
      <p style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>Click anywhere to continue</p>
    </div>
  );
}
