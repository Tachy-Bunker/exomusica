import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { createPortal } from "react-dom";
import { useAuth } from "../lib/auth";
import { useClassicMode } from "../lib/classicMode";
import { useProbeStore } from "../lib/probeStore";
import { LensChips, LensLayer } from "./LensLayer";
import { recordScan, syncScans } from "../lib/scanLog";
import { loadMilestones } from "../lib/milestones";
import { fireJingle } from "../lib/jingleBus";
import { allSelector, DEFAULT_COLORS, KIND_LABEL, probeCss, readoutOf, stepIndex, targetOfMention, targetOfPath, targetOfPoint, type ProbeColors, type Target } from "../lib/probeCore";

const DWELL_MS = 900; // resting the pointer on a bracket
const HOLD_MS = 450; // pressing and holding
const cache = new Map<string, unknown>();
const isCoarse = (): boolean => typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;

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

// Shared lens: how many others scanned the same thing. Asked only once the community has unlocked it, and remembered for a minute.
const sharedSeen = new Map<string, { at: number; n: number | null }>();
async function sharedCount(kind: string, key: string): Promise<number | null> {
  const id = `${kind}|${key}`, hit = sharedSeen.get(id);
  if (hit && Date.now() - hit.at < 60_000) return hit.n;
  const unlocked = (await loadMilestones().catch(() => [])).some((m) => m.key === "m-sharedlens" && m.reached);
  if (!unlocked) return null;
  const r = await api<{ others: number | null }>(`/api/scans/seen?kind=${encodeURIComponent(kind)}&key=${encodeURIComponent(key)}`).catch(() => null);
  const n = typeof r?.others === "number" ? r.others : null;
  sharedSeen.set(id, { at: Date.now(), n });
  return n;
}

export function ProbeLayer({ colors = DEFAULT_COLORS }: { colors?: ProbeColors }) {
  const { user } = useAuth();
  const on = useProbeStore((s) => s.on);
  const setOn = useProbeStore((s) => s.set);
  const classic = useClassicMode((s) => s.classic);
  const active = on && !classic;
  const [card, setCard] = useState<{ t: Target; title: string; lines: string[]; x: number; y: number; fresh: boolean; href: string | null } | null>(null);
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

  const [others, setOthers] = useState<{ key: string; n: number } | null>(null);
  const cancel = useCallback(() => { if (timer.current) { window.clearTimeout(timer.current); timer.current = null; } setBar(null); }, []);

  const scan = useCallback(async (el: Element) => {
    const t = targetOf(el);
    if (!t) return;
    (el as HTMLElement).dataset.probed = "1";
    const r = el.getBoundingClientRect();
    // page coordinates: the card is part of the page, so it scrolls with it
    const vw = window.visualViewport?.width ?? window.innerWidth; // the visible width, even when the page is wider than the screen
    const x = Math.min(Math.max(8, r.left), vw - 300) + window.scrollX, y = (r.bottom + 8 > window.innerHeight - 160 ? Math.max(8, r.top - 150) : r.bottom + 8) + window.scrollY;
    const a = (el as HTMLElement).closest("a[href]") as HTMLAnchorElement | null;
    let href: string | null = null;
    if (a) { try { const u = new URL(a.href, location.href); if (u.origin === location.origin) href = u.pathname + u.search + u.hash; } catch { /* not a URL */ } }
    const fresh = t.kind === "mod" ? false : recordScan(t.kind, t.key, !!user);
    window.dispatchEvent(new CustomEvent("exo:probed", { detail: t.key }));
    if (fresh) fireJingle("firstScan");
    let data: unknown = null;
    if (t.fetch) {
      if (cache.has(t.fetch)) data = cache.get(t.fetch);
      else { data = await api<unknown>(t.fetch).catch(() => null); cache.set(t.fetch, data); }
    }
    const ro = readoutOf(t, data);
    setCard({ t, title: ro.title, lines: t.kind === "mod" && t.note ? [t.note] : ro.lines, x, y, fresh, href });
    setOthers(null);
    if (user && t.kind !== "mod") void sharedCount(t.kind, t.key).then((n) => { if (n !== null) setOthers({ key: t.key, n }); });
  }, [user]);

  const arm = useCallback((el: Element, ms: number) => {
    cancel();
    const r = el.getBoundingClientRect();
    setBar({ x: r.left + window.scrollX, y: r.bottom - 3 + window.scrollY, w: r.width, ms });
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
    let lastType = "mouse";
    const down = (e: PointerEvent) => {
      lastType = e.pointerType;
      const el = find(e.target);
      if (el && e.pointerType !== "touch") arm(el, HOLD_MS); // a finger scans with a tap (below); a mouse holds
      else if (!el && !(e.target as Element | null)?.closest?.(".probe-card, .probe-ui, [data-testid=faceplate], .visor-hud, .visor-pop, .visor-card")) setCard(null); // tapping elsewhere puts the card away
    };
    const up = () => cancel();
    // a press that finished a scan must not also follow the link it was on
    const click = (e: MouseEvent) => {
      if (Date.now() - swallow.current < 600) { e.preventDefault(); e.stopPropagation(); swallow.current = 0; return; }
      if (lastType === "touch") { const el = find(e.target); if (el) { e.preventDefault(); e.stopPropagation(); swallow.current = 0; void scan(el); } }
    };
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "Escape") { if (document.body.classList.contains("visor-writing")) return; /* the note box handles its own Esc first */ if (card) setCard(null); else setOn(false); return; }
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

  const coarse = useMemo(isCoarse, []);
  const accent = useMemo(() => (card ? (colors[card.t.kind === "point" ? "lore" : card.t.kind] ?? colors.lore) : colors.lore), [card, colors]);
  if (!active) return null;
  return (
    <>
      <div className="probe-dim" aria-hidden="true" />
      <LensLayer />
      <div className="probe-hud probe-ui" role="status" data-testid="probe-hud">
        <b>PROBE</b> <span className={coarse ? "probe-hint tap" : "probe-hint keys"}>{coarse ? "tap a bracket to scan it" : <>hold or rest on a bracket · <kbd>[</kbd><kbd>]</kbd> step · <kbd>Enter</kbd> scan · <kbd>Esc</kbd> out</>}</span>
        <LensChips />
        <a className="btn" href="/field-log" data-testid="probe-log">Field Log</a>
        <button type="button" className="btn" onClick={() => setOn(false)} data-testid="probe-off">Off</button>
      </div>
      {bar && createPortal(<div className="probe-bar" style={{ left: bar.x, top: bar.y, width: bar.w, animationDuration: `${bar.ms}ms` }} aria-hidden="true" data-testid="probe-bar" />, document.body)}
      {card && createPortal(
        <div className="probe-card probe-ui" style={{ left: card.x, top: card.y, borderColor: accent }} role="dialog" aria-label="Probe readout" data-testid="probe-card">
          <div className="probe-card-kind" style={{ color: accent }}>{KIND_LABEL[card.t.kind]}{card.fresh && <span data-testid="probe-new"> · new</span>}</div>
          <b>{card.title}</b>
          {card.lines.map((l, i) => <p key={i}>{l}</p>)}
          {others && others.key === card.t.key && <p className="home-dim" data-testid="probe-others">{others.n === 0 ? "No one else has scanned this yet." : others.n === 1 ? "1 other member has scanned this." : `${others.n} other members have scanned this.`}</p>}
          <div className="probe-card-actions">
            {card.href && <a className="btn" href={card.href} data-testid="probe-open">Open</a>}
            <button type="button" className="btn" onClick={() => setCard(null)} aria-label="Close readout" data-testid="probe-close">Close</button>
          </div>
        </div>, document.body)}
    </>
  );
}
