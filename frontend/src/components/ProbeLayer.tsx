import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useClassicMode } from "../lib/classicMode";
import { useProbeStore } from "../lib/probeStore";
import { recordScan, syncScans } from "../lib/scanLog";
import { fireJingle } from "../lib/jingleBus";
import { allSelector, DEFAULT_COLORS, KIND_LABEL, probeCss, readoutOf, stepIndex, targetOfMention, targetOfPath, targetOfPoint, type ProbeColors, type Target } from "../lib/probeCore";

const DWELL_MS = 900; // resting the pointer on a bracket
const HOLD_MS = 450; // pressing and holding
const cache = new Map<string, unknown>();

function targetOf(el: Element): Target | null {
  const h = el as HTMLElement;
  if (h.dataset.probeKey) return { kind: (h.dataset.probe as Target["kind"]) ?? "lore", key: h.dataset.probeKey, label: h.dataset.probeLabel ?? h.dataset.probeKey, fetch: h.dataset.probeFetch ?? null, note: h.dataset.probeNote };
  if (h.classList.contains("probe-point")) return targetOfPoint(h.textContent ?? "", h.dataset.probeNote ?? "", location.pathname);
  if (h.matches('[data-probe="mod"]')) return { kind: "mod", key: "mod:" + (h.dataset.probeLabel ?? "flag"), label: h.dataset.probeLabel ?? "Flagged", fetch: null, note: h.dataset.probeNote };
  if (h.classList.contains("mention")) return targetOfMention(h.textContent ?? "");
  const a = h.closest("a[href]") as HTMLAnchorElement | null;
  if (a) { try { const u = new URL(a.href, location.href); if (u.origin === location.origin) return targetOfPath(u.pathname); } catch { /* not a URL */ } }
  return null;
}

export function ProbeLayer({ colors = DEFAULT_COLORS }: { colors?: ProbeColors }) {
  const { user } = useAuth();
  const on = useProbeStore((s) => s.on);
  const setOn = useProbeStore((s) => s.set);
  const classic = useClassicMode((s) => s.classic);
  const active = on && !classic;
  const [card, setCard] = useState<{ t: Target; title: string; lines: string[]; x: number; y: number; fresh: boolean } | null>(null);
  const [bar, setBar] = useState<{ x: number; y: number; w: number; ms: number } | null>(null);
  const cur = useRef<Element | null>(null);
  const timer = useRef<number | null>(null);
  const swallow = useRef(0);
  const isAdmin = !!user?.isAdmin;

  // The stylesheet and body classes exist only while the mode is on.
  useEffect(() => {
    if (!active) return;
    const style = document.createElement("style"); style.dataset.probe = ""; style.textContent = probeCss(colors, isAdmin, location.origin);
    document.head.appendChild(style);
    document.body.classList.add("probe"); if (isAdmin) document.body.classList.add("probe-admin");
    if (user) void syncScans();
    return () => { style.remove(); document.body.classList.remove("probe", "probe-admin"); document.querySelectorAll(".probe-cur").forEach((e) => e.classList.remove("probe-cur")); setCard(null); setBar(null); };
  }, [active, colors, isAdmin, user]);

  const cancel = useCallback(() => { if (timer.current) { window.clearTimeout(timer.current); timer.current = null; } setBar(null); }, []);

  const scan = useCallback(async (el: Element) => {
    const t = targetOf(el);
    if (!t) return;
    (el as HTMLElement).dataset.probed = "1";
    const r = el.getBoundingClientRect();
    const x = Math.min(Math.max(8, r.left), window.innerWidth - 300), y = r.bottom + 8 > window.innerHeight - 160 ? Math.max(8, r.top - 150) : r.bottom + 8;
    const fresh = t.kind === "mod" ? false : recordScan(t.kind, t.key, !!user);
    if (fresh) fireJingle("firstScan");
    let data: unknown = null;
    if (t.fetch) {
      if (cache.has(t.fetch)) data = cache.get(t.fetch);
      else { data = await api<unknown>(t.fetch).catch(() => null); cache.set(t.fetch, data); }
    }
    const ro = readoutOf(t, data);
    setCard({ t, title: ro.title, lines: t.kind === "mod" && t.note ? [t.note] : ro.lines, x, y, fresh });
  }, [user]);

  const arm = useCallback((el: Element, ms: number) => {
    cancel();
    const r = el.getBoundingClientRect();
    setBar({ x: r.left, y: r.bottom - 3, w: r.width, ms });
    timer.current = window.setTimeout(() => { timer.current = null; setBar(null); swallow.current = Date.now(); void scan(el); }, ms);
  }, [cancel, scan]);

  useEffect(() => {
    if (!active) return;
    const ALL_SELECTOR = allSelector(location.origin);
    const find = (n: EventTarget | null): Element | null => {
      const el = n instanceof Element ? n.closest(ALL_SELECTOR) : null;
      if (!el || el.closest(".probe-ui")) return null;
      if (el.matches('[data-probe="mod"]') && !isAdmin) return null;
      return targetOf(el) ? el : null;
    };
    const over = (e: PointerEvent) => { const el = find(e.target); if (el && e.pointerType === "mouse") arm(el, DWELL_MS); };
    const out = (e: PointerEvent) => { if (find(e.target)) cancel(); };
    const down = (e: PointerEvent) => { const el = find(e.target); if (el) arm(el, HOLD_MS); };
    const up = () => cancel();
    // a press that finished a scan must not also follow the link it was on
    const click = (e: MouseEvent) => { if (Date.now() - swallow.current < 600) { e.preventDefault(); e.stopPropagation(); swallow.current = 0; } };
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "Escape") { if (card) setCard(null); else setOn(false); return; }
      if (e.key === "]" || e.key === "[") {
        const list = [...document.querySelectorAll(ALL_SELECTOR)].filter((n) => !n.closest(".probe-ui") && find(n) === n && (n as HTMLElement).offsetParent !== null);
        const i = stepIndex(list.length, cur.current ? list.indexOf(cur.current) : -1, e.key === "]" ? 1 : -1);
        cur.current?.classList.remove("probe-cur");
        cur.current = i >= 0 ? list[i] : null;
        if (cur.current) { cur.current.classList.add("probe-cur"); cur.current.scrollIntoView({ block: "center", behavior: "auto" }); setCard(null); }
        e.preventDefault();
      } else if (e.key === "Enter" && cur.current && !e.altKey) { e.preventDefault(); void scan(cur.current); }
    };
    document.addEventListener("pointerover", over, true); document.addEventListener("pointerout", out, true);
    document.addEventListener("pointerdown", down, true); document.addEventListener("pointerup", up, true); document.addEventListener("pointercancel", up, true);
    document.addEventListener("click", click, true); document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerover", over, true); document.removeEventListener("pointerout", out, true);
      document.removeEventListener("pointerdown", down, true); document.removeEventListener("pointerup", up, true); document.removeEventListener("pointercancel", up, true);
      document.removeEventListener("click", click, true); document.removeEventListener("keydown", key); cancel();
    };
  }, [active, arm, cancel, card, isAdmin, scan, setOn]);

  // I toggles the mode from anywhere that isn't a text box
  useEffect(() => {
    if (classic) return;
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.code !== "KeyI" || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      useProbeStore.getState().toggle();
    };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [classic]);

  const accent = useMemo(() => (card ? (colors[card.t.kind === "point" ? "lore" : card.t.kind] ?? colors.lore) : colors.lore), [card, colors]);
  if (!active) return null;
  return (
    <>
      <div className="probe-dim" aria-hidden="true" />
      <div className="probe-hud probe-ui" role="status" data-testid="probe-hud">
        <b>PROBE</b> hold or rest on a bracket · <kbd>[</kbd><kbd>]</kbd> step · <kbd>Enter</kbd> scan · <kbd>Esc</kbd> out
        <a className="btn" href="/field-log" data-testid="probe-log">Field Log</a>
        <button type="button" className="btn" onClick={() => setOn(false)} data-testid="probe-off">Off</button>
      </div>
      {bar && <div className="probe-bar" style={{ left: bar.x, top: bar.y, width: bar.w, animationDuration: `${bar.ms}ms` }} aria-hidden="true" data-testid="probe-bar" />}
      {card && (
        <div className="probe-card probe-ui" style={{ left: card.x, top: card.y, borderColor: accent }} role="dialog" aria-label="Probe readout" data-testid="probe-card">
          <div className="probe-card-kind" style={{ color: accent }}>{KIND_LABEL[card.t.kind]}{card.fresh && <span data-testid="probe-new"> · new</span>}</div>
          <b>{card.title}</b>
          {card.lines.map((l, i) => <p key={i}>{l}</p>)}
        </div>
      )}
    </>
  );
}
