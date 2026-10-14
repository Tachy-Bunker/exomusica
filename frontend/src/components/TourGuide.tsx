import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useClassicMode } from "../lib/classicMode";
import { useProbeStore } from "../lib/probeStore";
import { nextStep, presentStops, readTour, shouldInvite, stopKey, STOPS, writeTour, type Stop } from "../lib/tour";

const reduced = (): boolean => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const ATTRS = ["data-probe", "data-probe-key", "data-probe-label", "data-probe-note"];

/** "Scan the core": the invitation on a first visit, and the walk itself. Each stop is made scannable only while it is the current one, so the homepage carries no permanent brackets.
 *  Scanning the stop (or pressing Next) moves on; Skip and Esc end it at once. Without Probe (classic mode) it is plain highlights and Next. */
export function TourGuide() {
  const { user } = useAuth();
  const classic = useClassicMode((s) => s.classic);
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [stops, setStops] = useState<Stop[] | null>(null);
  const [i, setI] = useState(0);
  const [invite, setInvite] = useState(false);
  const turnedOn = useRef(false);
  const startTimer = useRef<number | null>(null);

  useEffect(() => { setInvite(shouldInvite(readTour(), !!user, classic)); }, [user, classic]);

  const clear = useCallback(() => {
    document.querySelectorAll(".tour-cur").forEach((el) => { el.classList.remove("tour-cur"); ATTRS.forEach((a) => el.removeAttribute(a)); });
  }, []);
  const finish = useCallback((how: "done" | "skipped") => {
    clear(); writeTour(how); setStops(null); setInvite(false);
    if (turnedOn.current) { useProbeStore.getState().set(false); turnedOn.current = false; }
  }, [clear]);
  const start = useCallback(() => {
    const present = presentStops((sel) => !!document.querySelector(sel));
    if (present.length === 0) return;
    setInvite(false); setI(0); setStops(present);
    if (!classic && !useProbeStore.getState().on) { useProbeStore.getState().set(true); turnedOn.current = true; }
  }, [classic]);

  // ?tour=1 starts it from anywhere (the Account page and the footer link use this)
  useEffect(() => {
    if (params.get("tour") !== "1") return;
    const next = new URLSearchParams(params); next.delete("tour"); setParams(next, { replace: true });
    startTimer.current = window.setTimeout(start, 400); // after the page has drawn its sections (not cleared on the param change above, which re-runs this effect)
  }, [params, setParams, start]);
  useEffect(() => () => { if (startTimer.current) window.clearTimeout(startTimer.current); }, []);

  useEffect(() => { document.body.classList.toggle("touring", !!stops); return () => document.body.classList.remove("touring"); }, [stops]); // the traces panel steps aside while touring

  // mark the current stop
  const cur = stops?.[i] ?? null;
  useEffect(() => {
    if (!cur) return;
    clear();
    const el = document.querySelector<HTMLElement>(cur.sel);
    if (!el) return;
    el.classList.add("tour-cur");
    if (!classic) { el.setAttribute("data-probe", "lore"); el.setAttribute("data-probe-key", stopKey(cur.id)); el.setAttribute("data-probe-label", cur.title); el.setAttribute("data-probe-note", cur.text); }
    el.scrollIntoView({ block: "center", behavior: reduced() ? "auto" : "smooth" });
    return clear;
  }, [cur, classic, clear]);

  const advance = useCallback(() => {
    if (!stops) return;
    const n = nextStep(i, stops.length);
    if (n < 0) finish("done"); else setI(n);
  }, [stops, i, finish]);

  // scanning the current stop counts as seeing it
  useEffect(() => {
    if (!cur) return;
    const on = (e: Event) => { if ((e as CustomEvent<string>).detail === stopKey(cur.id)) window.setTimeout(advance, 1100); };
    window.addEventListener("exo:probed", on);
    return () => window.removeEventListener("exo:probed", on);
  }, [cur, advance]);

  useEffect(() => {
    if (!stops) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.body.classList.contains("visor-writing") && !document.querySelector("[data-testid=probe-card]")) finish("skipped"); };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [stops, finish]);

  if (stops && cur) {
    const last = i === stops.length - 1;
    return (
      <div className="tour-card" role="dialog" aria-label="Guided tour" data-testid="tour-card">
        <div className="tour-step">Scan the core · {i + 1}/{stops.length}</div>
        <b>{cur.title}</b>
        <p>{cur.text}</p>
        <p className="home-dim tour-hint">{classic ? "Press Next when you have read it." : "Rest on (or tap) the highlighted bracket to scan it, or press Next."}</p>
        <div className="tour-actions">
          <button type="button" className="btn btn-primary" onClick={advance} data-testid="tour-next">{last ? "Finish" : "Next"}</button>
          {last && !user && <button type="button" className="btn" onClick={() => { finish("done"); navigate("/join"); }} data-testid="tour-join">Join</button>}
          <button type="button" className="btn" onClick={() => finish("skipped")} data-testid="tour-skip">Skip tour</button>
        </div>
      </div>
    );
  }
  if (invite) {
    return (
      <div className="tour-invite" role="region" aria-label="Guided tour" data-testid="tour-invite">
        <span><b>New here?</b> Scan the core: a 30-second look around.</span>
        <button type="button" className="btn btn-primary" onClick={start} data-testid="tour-start">Start</button>
        <button type="button" className="btn" onClick={() => { writeTour("skipped"); setInvite(false); }} data-testid="tour-no">No thanks</button>
      </div>
    );
  }
  return null;
}

export { STOPS };
