import { useEffect, useRef, useState } from "react";
import { parseVoiceoverLines } from "../lib/voiceoverLines";

interface Props {
  gifUrl: string;
  voiceoverUrl: string | null;
  text: string | null;
  onDone: () => void;
}

export function BranchIntroOverlay({ gifUrl, voiceoverUrl, text, onDone }: Props) {
  const [visible, setVisible] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const lines = useRef(parseVoiceoverLines(text ?? "")).current;
  const [lineIndex, setLineIndex] = useState(0);
  const [revealedCount, setRevealedCount] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 20);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (visible && voiceoverUrl) {
      audioRef.current?.play().catch(() => {});
    }
  }, [visible, voiceoverUrl]);

  // Sequences through the timed lines — each character reveals evenly
  // across that line's own duration, then advances to the next line once
  // the duration elapses (a fixed timer, not just "reveal finished", so
  // timing stays accurate to what was authored even for very short lines).
  useEffect(() => {
    if (!visible || lines.length === 0) return;
    const line = lines[lineIndex];
    setRevealedCount(0);
    const charInterval = (line.duration * 1000) / Math.max(line.text.length, 1);
    const charTimer = setInterval(() => {
      setRevealedCount((prev) => Math.min(prev + 1, line.text.length));
    }, charInterval);
    const advanceTimer = setTimeout(() => {
      clearInterval(charTimer);
      if (lineIndex < lines.length - 1) setLineIndex((i) => i + 1);
      else if (!voiceoverUrl) dismiss(); // no audio to wait on — end after the last line
    }, line.duration * 1000);
    return () => {
      clearInterval(charTimer);
      clearTimeout(advanceTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, lineIndex]);

  function dismiss() {
    setVisible(false);
    setTimeout(onDone, 300);
  }

  const currentLine = lines[lineIndex];

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
      {currentLine && (
        <p
          className="mono"
          style={{ maxWidth: 560, minHeight: "1.6em", textAlign: "center", fontSize: "1rem", color: "var(--text)", padding: "0 1rem" }}
        >
          {currentLine.text.slice(0, revealedCount)}
          {revealedCount < currentLine.text.length && <span className="space-hud-cursor">▌</span>}
        </p>
      )}
      {voiceoverUrl && <audio ref={audioRef} src={voiceoverUrl} onEnded={dismiss} />}
      <p style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>Click anywhere to continue</p>
    </div>
  );
}
