import { useEffect, useRef, useState } from "react";
import { loadStrip, type Strip } from "../lib/specStrip";
import { SpecLayer } from "./SpecLayer";
import { fmtClock, PIN_EVENT, usePinStore } from "../lib/voicePins";
import { useAuth } from "../lib/auth";

let playing: HTMLAudioElement | null = null; // one voice note at a time
const TINT = "#5ef2d0";

/** A voice note as a picture of its sound: tap to play, drag across it to scrub, pin a reply to a moment. Falls back to the plain player when the picture can't be made. */
export function VoiceStrip({ id, url, messageId }: { id: number; url: string; messageId: number }) {
  const { user } = useAuth();
  const audio = useRef<HTMLAudioElement>(null);
  const [strip, setStrip] = useState<Strip | null>(null);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const [on, setOn] = useState(false);
  const pins = usePinStore((s) => s.pins[messageId]) ?? [];
  useEffect(() => { let live = true; loadStrip(id, "voice").then((s) => { if (live) setStrip(s); }); return () => { live = false; }; }, [id]);
  useEffect(() => {
    const a = audio.current; if (!a) return;
    const sync = () => { setT(a.currentTime); setDur(Number.isFinite(a.duration) ? a.duration : 0); };
    const go = () => { setOn(true); if (playing && playing !== a) playing.pause(); playing = a; };
    const stop = () => { setOn(false); if (playing === a) playing = null; };
    a.addEventListener("timeupdate", sync); a.addEventListener("loadedmetadata", sync); a.addEventListener("play", go); a.addEventListener("pause", stop); a.addEventListener("ended", stop);
    return () => { a.pause(); a.removeEventListener("timeupdate", sync); a.removeEventListener("loadedmetadata", sync); a.removeEventListener("play", go); a.removeEventListener("pause", stop); a.removeEventListener("ended", stop); };
  }, []);

  if (strip === "none") return <audio controls src={url} preload="none" style={{ display: "block", width: "100%", maxWidth: 320 }} />;
  const frac = dur > 0 ? Math.min(1, t / dur) : 0;
  function seekTo(e: React.PointerEvent<HTMLDivElement>) {
    const a = audio.current, r = e.currentTarget.getBoundingClientRect(); if (!a || !dur) return;
    a.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur; setT(a.currentTime);
  }
  const toggle = () => { const a = audio.current; if (!a) return; if (a.paused) void a.play(); else a.pause(); };
  return (
    <div className="voice-strip" data-testid="voice-strip">
      <audio ref={audio} src={url} preload="metadata" />
      <button type="button" className="voice-play" onClick={toggle} aria-label={on ? "Pause" : "Play"} data-testid="voice-play">{on ? "❚❚" : "▶"}</button>
      <div className="voice-wave" role="slider" aria-label="Voice note position" aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(t)}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); seekTo(e); }} onPointerMove={(e) => { if (e.buttons) seekTo(e); }} data-testid="voice-wave">
        {strip ? <SpecLayer strip={strip} color={TINT} pct={frac * 100} comments={pins.map((p) => ({ id: p.id, atSeconds: p.at, body: p.text, user: p.by, createdAt: "", avatarUrl: null, userId: 0 }))} duration={dur} onPin={(c) => { const a = audio.current; if (a) { a.currentTime = c.atSeconds; void a.play(); } }} /> : <div className="voice-wait" />}
      </div>
      <span className="voice-time mono">{fmtClock(t)}<i>/{dur ? fmtClock(dur) : "–:––"}</i></span>
      {user && <button type="button" className="voice-pinbtn" onClick={() => window.dispatchEvent(new CustomEvent(PIN_EVENT, { detail: { messageId, at: t } }))} aria-label={`Reply at ${fmtClock(t)}`} title={`Reply to this moment (${fmtClock(t)})`} data-testid="voice-pin">📍</button>}
    </div>
  );
}
