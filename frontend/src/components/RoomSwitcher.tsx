import { useEffect, useMemo, useRef, useState } from "react";
import { useChatDockStore } from "../lib/chatDockStore";
import { dialOrder } from "../lib/rooms";
import { freqOfRoom, Lamp, Ping } from "./DialRail";
import { usePulseStore } from "../lib/dialPulse";
import { timeAgo } from "../lib/relativeTime";

export const WHISPER = "exomusica:whisper";

/** Every room on the dial in one list, with the last line said there. Opens with Q (or the Rooms button), closes with Esc or Q.
 *  Arrows or 1-6 pick, Enter tunes, the arrow-up button on a row sends the unsent draft to that room without leaving. Scenes live at the bottom. */
export function RoomSwitcher() {
  const st = useChatDockStore();
  const pulse = usePulseStore((s) => s.by);
  const rooms = useMemo(() => dialOrder(st.presets, st.recents), [st.presets, st.recents]);
  const [at, setAt] = useState(() => Math.max(0, rooms.findIndex((r) => r.slug === st.openChannelSlug)));
  const [name, setName] = useState("");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.focus(); }, []);
  const close = () => useChatDockStore.getState().setSwitcher(false);
  useEffect(() => { // Esc closes it even when focus has fallen out of the box (a button that just disabled itself)
    const on = (e: KeyboardEvent) => { if (e.key === "Escape") useChatDockStore.getState().setSwitcher(false); };
    window.addEventListener("keydown", on); return () => window.removeEventListener("keydown", on);
  }, []);
  const go = (i: number) => { const r = rooms[i]; if (r) { st.openChat(r.slug, r.name, r.branchSlug); close(); } };
  const whisper = (i: number) => { const r = rooms[i]; if (r) { window.dispatchEvent(new CustomEvent(WHISPER, { detail: { slug: r.slug, name: r.name, handled: false } })); close(); } };
  function key(e: React.KeyboardEvent) {
    if ((e.target as HTMLElement).tagName === "INPUT") { if (e.key === "Escape") { e.preventDefault(); close(); } return; }
    if (e.key === "Escape" || e.key.toLowerCase() === "q") { e.preventDefault(); close(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setAt((a) => Math.min(rooms.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setAt((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); if (e.shiftKey) whisper(at); else go(at); }
    else if (/^[1-6]$/.test(e.key)) { e.preventDefault(); const slot = st.presets[Number(e.key) - 1]; if (slot) { st.openChat(slot.slug, slot.name, slot.branchSlug); close(); } }
  }
  const slotNo = (slug: string) => st.presets.findIndex((p) => p?.slug === slug) + 1;
  return (
    <div className="rs-back" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div ref={box} className="rs" role="dialog" aria-modal="true" aria-label="Rooms" tabIndex={-1} onKeyDown={key} data-testid="rooms">
        <p className="rs-head"><b>ROOMS</b><span>↑↓ choose · Enter tune · Shift+Enter send my draft there · 1–6 slots · Esc close</span><button type="button" className="rs-close" onClick={close} aria-label="Close">×</button></p>
        {rooms.length === 0 ? <p className="home-dim">No rooms yet. Open a chat and pin it to a slot, or drop a branch on the dial.</p> : (
          <ul className="rs-list">
            {rooms.map((r, i) => {
              const p = pulse[r.slug];
              return (
                <li key={r.slug} className={`${i === at ? "on" : ""}${r.slug === st.openChannelSlug ? " here" : ""}${r.asleep ? " asleep" : ""}`} onMouseEnter={() => setAt(i)}>
                  <button type="button" className="rs-main" onClick={() => go(i)} data-testid="rooms-row">
                    <i className="rs-no">{slotNo(r.slug) || "·"}</i>
                    <span className="rs-name">{r.name}<Ping slug={r.slug} current={r.slug === st.openChannelSlug} /></span>
                    <span className="rs-freq">{freqOfRoom(r)}</span><Lamp slug={r.slug} />
                    <span className="rs-line">{p?.line ? <><b>{p.line.by}</b> {p.line.text}{p.last ? <em> · {timeAgo(p.last * 1000)}</em> : null}</> : <em>quiet</em>}</span>
                  </button>
                  <button type="button" className="rs-send" onClick={() => whisper(i)} aria-label={`Send my draft to ${r.name}`} title="Send my unsent draft here" data-testid="room-whisper">↑</button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="rs-scenes" data-testid="scenes">
          <b>Scenes</b>
          {st.scenes.map((s) => (
            <span key={s.name} className="rs-scene"><button type="button" onClick={() => { st.applyScene(s.name); }} title="Load these six slots" data-testid="scene">{s.name}</button><button type="button" onClick={() => st.deleteScene(s.name)} aria-label={`Delete scene ${s.name}`}>×</button></span>
          ))}
          <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) { st.saveSceneAs(name); setName(""); } }}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Save the six slots as…" maxLength={24} aria-label="Scene name" data-testid="scene-name" />
            <button className="btn" type="submit" disabled={!name.trim() || !st.presets.some(Boolean)} data-testid="scene-save">Save</button>
          </form>
        </div>
      </div>
    </div>
  );
}
