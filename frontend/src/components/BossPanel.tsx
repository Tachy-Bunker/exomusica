import { useEffect, useRef, useState } from "react";
import { BOSS_ROUNDS, freqOf, judge, motifOf, voiceOf } from "../lib/roomBoss";
import { tone } from "../lib/roomSfx";

interface Props { name: string; seed: number; diff: number; beaten: boolean; color: string; onWin: () => void; onClose: () => void; onEngage: () => void }
const NOTE_GAP = 0.55;

/** Call and response: the sound states a motif, you answer on the pad, it changes the motif. Three rounds, no health, no losing: a wrong answer just plays again. A beaten one lets you play its voice. */
export function BossPanel({ name, seed, diff, beaten, color, onWin, onClose, onEngage }: Props) {
  const v = useRef(voiceOf(seed, diff)).current;
  const [round, setRound] = useState(0), [reply, setReply] = useState<number[]>([]), [msg, setMsg] = useState(beaten ? "Quiet now. Its voice is yours: play it." : "Listen. Then answer on the pad."), [won, setWon] = useState(beaten), [lit, setLit] = useState(-1);
  const motif = motifOf(seed, diff, Math.min(round, BOSS_ROUNDS - 1)), engaged = useRef(false), timers = useRef<number[]>([]);
  const play = (m: readonly number[] = motif) => {
    timers.current.forEach(clearTimeout); timers.current = [];
    m.forEach((d, i) => { tone(freqOf(v, d), 0.7, v.partials, i * NOTE_GAP, 0.11); timers.current.push(window.setTimeout(() => setLit(d), i * NOTE_GAP * 1000), window.setTimeout(() => setLit(-1), i * NOTE_GAP * 1000 + 400)); });
  };
  useEffect(() => { if (!won) { const t = window.setTimeout(() => play(), 350); timers.current.push(t); } return () => timers.current.forEach(clearTimeout); }, [round]); // eslint-disable-line react-hooks/exhaustive-deps
  const press = (d: number) => {
    tone(freqOf(v, d), 0.6, v.partials, 0, 0.11); setLit(d); window.setTimeout(() => setLit(-1), 200);
    if (won) return;
    if (!engaged.current) { engaged.current = true; onEngage(); }
    const next = [...reply, d], r = judge(next, motif);
    if (r.right < next.length) { setReply([]); setMsg("It does not resolve. Listen again."); window.setTimeout(() => play(), 700); return; }
    setReply(next);
    if (r.ok) {
      setReply([]);
      if (round + 1 >= BOSS_ROUNDS) { setWon(true); setMsg("The sound resolves. Its voice is yours."); const root = [0, 2, 4]; root.forEach((x, i) => tone(freqOf(v, x), 1.6, v.partials, 0.3 + i * 0.12, 0.09)); onWin(); }
      else { setMsg(`Answered. Round ${round + 2} of ${BOSS_ROUNDS}: it has changed.`); setRound(round + 1); }
    }
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.code === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); onClose(); return; }
      const n = /^(Digit|Numpad)([1-7])$/.exec(e.code); if (n) { e.preventDefault(); e.stopImmediatePropagation(); press(Number(n[2]) - 1); }
    };
    window.addEventListener("keydown", k, true); return () => window.removeEventListener("keydown", k, true);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="bp" role="dialog" aria-label={name} data-testid="boss-panel" style={{ ["--bp" as string]: color }}>
      <div className="bp-card" onPointerDown={(e) => e.stopPropagation()}>
        <b className="bp-name">{name || "The Unnamed Sound"}</b>
        <p className="bp-state" data-testid="boss-state" aria-live="polite">{won ? "Resolved." : `Round ${round + 1} of ${BOSS_ROUNDS}`} {msg}</p>
        <div className="bp-dots" aria-hidden="true">{motif.map((_, i) => <i key={i} className={i < reply.length ? "on" : ""} />)}</div>
        <div className="bp-pad" role="group" aria-label="Pitch pad">
          {[0, 1, 2, 3, 4, 5, 6].map((d) => <button key={d} type="button" data-testid={`boss-pad-${d}`} className={lit === d ? "lit" : ""} style={{ height: `${46 + d * 7}px` }} onClick={() => press(d)} aria-label={`Note ${d + 1}`}>{d + 1}</button>)}
        </div>
        <div className="bp-row">
          {!won && <button type="button" className="bp-b" data-testid="boss-listen" onClick={() => play()}>Listen again</button>}
          <button type="button" className="bp-b" data-testid="boss-close" onClick={onClose}>{won ? "Done" : "Leave it"}</button>
        </div>
        <p className="bp-hint">Keys 1–7 play the pad. Esc leaves. Nothing is lost if you leave.</p>
      </div>
    </div>
  );
}
