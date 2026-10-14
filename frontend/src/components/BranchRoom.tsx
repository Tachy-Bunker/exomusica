import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { RoomDoor, RoomProp, RoomWorld } from "../lib/roomWorld";
import { startDrone, stepDrone, droneWanted, setDroneWanted } from "../lib/roomDrone";
import { useAudioStore } from "../lib/audioStore";
import { applyList, glide, isVisible, joinRoom, setVisible, type Shown } from "../lib/roomNet";
import { clamp, doorWalkedInto, facing, MAX_PITCH, stepEye, wrapYaw, type Eye, type Target } from "../lib/roomView";
import { actorLayer, painterFor, paintRoom, ScenePaint, type DroneView, type FxView } from "../lib/roomPaint";
import { cleanDoc, emptyDoc, pushOut, WireRuntime, type RoomDoc } from "../lib/roomDoc";
import { getJson, clearShared } from "../lib/sharedGet";
import { api } from "../lib/api";
import { RoomEditor } from "./RoomEditor";
import { makePool, parseGhosts, stepGhosts, type Ghost } from "../lib/roomGhosts";
import { buildLink, crossed, eyeSpace, flipLink, inRoom, resolveMove, type Link as RoomLink } from "../lib/roomScene";
import { ScaleGovernor } from "../lib/roomPerf";
import { aimAt, pickLock, refreshLock, type Lock } from "../lib/roomLock";
import { isTypingTarget } from "../lib/isTypingTarget";
import { useAuth } from "../lib/auth";
import { recordScan, scannedIds, scanId } from "../lib/scanLog";
import { EchoField } from "../lib/roomEcho";
import { playEcho, playScan } from "../lib/roomEchoAudio";
import { addLog, noteRoom, scannables, shownOf, type Lore, type Scannable, type ShownLore } from "../lib/roomLore";
import { RoomStick } from "./RoomStick";

const KEYS: Record<string, [number, number, number, number]> = { // forward, strafe, turn, look
  KeyW: [1, 0, 0, 0], KeyS: [-1, 0, 0, 0], ArrowUp: [0, 0, 0, 1], ArrowDown: [0, 0, 0, -1],
  KeyA: [0, -1, 0, 0], KeyD: [0, 1, 0, 0], ArrowLeft: [0, 0, -1, 0], ArrowRight: [0, 0, 1, 0], KeyQ: [0, 0, -1, 0], KeyE: [0, 0, 1, 0],
  PageUp: [0, 0, 0, 1], PageDown: [0, 0, 0, -1],
};
const NO_ONE: Shown[] = [];
const NO_PEOPLE_ITER: Shown[] = [];

const SCAN_MS = 900, SCAN_REACH = 10, CARD_MS = 9000, WANT_R = 6.5, OPEN_R = 4.4, KEEP_R = 5.4, OPEN_RATE = 2.4;

interface Props {
  world: RoomWorld; color: string;
  /** The room behind the door you are near, loaded ahead (never more than this one). */
  next: RoomWorld | null;
  /** Ask for the room behind a door (null: none needed). */
  wantNext: (slug: string | null) => void;
  /** You walked through into the next room: it is now the one you are in. */
  onAdvance: (slug: string) => void;
  /** Go to a path (a door or a pedestal). `door` is true for a door to another room. */
  go: (to: string, door: boolean) => void;
  /** Changes when something shown in the room (the terminal screens) was updated from outside: repaint. */
  tick?: number;
  mapHref: string; backHref: string; onLocked: () => void;
  /** A terminal was used: the page opens its screen. */
  onProp: (p: RoomProp) => void;
  /** A terminal screen is open: the room keeps still and listens to nothing. */
  paused: boolean;
  /** The drone (the audio player) was tapped or called. */
  onDrone: () => void;
  /** The echo visor: `on` once the community has unlocked it, else `hint` says how far away that is. */
  visor: { on: boolean; hint: string };
  /** The owner's lore, by scan address. */
  lore: ReadonlyMap<string, Lore> | null;
  /** Open the logbook. */
  onLogbook: () => void;
}

/** The first-person room. Input is read into refs and the canvas is only drawn while something moves or changes, so a parked room costs nothing. */
export function BranchRoom({ tick, world, color, next, wantNext, onAdvance, go, mapHref, backHref, onLocked, onProp, paused, onDrone, visor, lore, onLogbook }: Props) {
  const stage = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null), prompt = useRef<HTMLDivElement>(null), toast = useRef<HTMLDivElement>(null);
  const wref = useRef(world), linkRef = useRef<RoomLink | null>(null), nextRef = useRef(next), wantedRef = useRef<string | null>(null), waitRef = useRef(0), spaceRef = useRef("cur");
  const sp = useRef(new ScenePaint()), wantNextRef = useRef(wantNext), advanceRef = useRef(onAdvance); nextRef.current = next; wantNextRef.current = wantNext; advanceRef.current = onAdvance;
  const rtRef = useRef<WireRuntime | null>(null), docSlug = useRef(""), pushed = useRef({ x: 0, z: 0 });
  const solve = useRef((x: number, z: number) => {
    let r = resolveMove(wref.current, linkRef.current, x, z); const rt = rtRef.current;
    if (rt && docSlug.current === wref.current.slug && rt.doc.actors.length && pushOut(rt.doc, rt, r.x, r.z, 0.3, pushed.current)) r = resolveMove(wref.current, linkRef.current, pushed.current.x, pushed.current.z);
    return r;
  }).current;
  const { user } = useAuth(), isAdmin = !!user?.isAdmin, userRef = useRef(!!user); userRef.current = !!user;
  const visorRef = useRef(visor), loreRef = useRef(lore), logbookRef = useRef(onLogbook); visorRef.current = visor; loreRef.current = lore; logbookRef.current = onLogbook;
  const fxWorld = useRef<RoomWorld | null>(null), scanList = useRef<Scannable[]>([]), echo = useRef<EchoField | null>(null);
  const fxv = useRef<FxView>({ echo: null, now: 0, scan: null }), scanSt = useRef<{ s: Scannable; t0: number } | null>(null), scanView = useRef({ x: 0, y: 0, z: 0, p: 0 });
  const [card, setCard] = useState<ShownLore | null>(null), cardT = useRef(0);
  const eye = useRef<Eye>({ ...world.spawn, pitch: 0 });
  const keys = useRef(new Set<string>()), stick = useRef({ x: 0, y: 0 }), drag = useRef<{ id: number; x: number; y: number; moved: number; type: string } | null>(null);
  const dirty = useRef(true), raf = useRef(0), last = useRef(0), traveling = useRef(false), size = useRef({ w: 0, h: 0 }), tgt = useRef<Target | null>(null), shown = useRef(""), bumped = useRef(false);
  const lookAcc = useRef({ yaw: 0, pitch: 0 }), drawn = useRef(0);
  const ghosts = useRef<Ghost[]>([]), gpool = useRef(makePool()), drawList = useRef<Shown[]>([]), ghostT = useRef(0);
  const others = useRef(new Map<number, Shown>()), link = useRef<ReturnType<typeof joinRoom>>(null), pausedRef = useRef(paused), [visible, setVis] = useState(isVisible), [here, setHere] = useState(0);
  pausedRef.current = paused;
  const gov = useRef(new ScaleGovernor()), dprBase = useRef(1), lock = useRef<Lock | null>(null), [locked, setLocked] = useState(false), pendingPaint = useRef(false), prefetchAt = useRef(0), perfEl = useRef<HTMLDivElement>(null), perfAt = useRef(0), dsAt = useRef(0), dsAt2 = useRef(0);
  const perfMul = useRef(typeof location !== "undefined" ? Number(/[?&]perfmul=(\d+)/.exec(location.search)?.[1] ?? 1) : 1); // test hook: pretend the device is N times slower
  const perfOn = useRef(typeof location !== "undefined" && /[?&]perf\b/.test(location.search));
  const drone = useRef(startDrone({ ...world.spawn, pitch: 0 })), dview = useRef<DroneView>({ d: drone.current, playing: false, title: "", t: 0, hit: null }), lastPaint = useRef(0);
  const [droneOn, setDroneOn] = useState(droneWanted), droneOnRef = useRef(droneOn); droneOnRef.current = droneOn;
  const track = useAudioStore((s) => s.currentTrack), playing = useAudioStore((s) => s.isPlaying);
  const audioRef = useRef({ title: "", playing: false }); audioRef.current = { title: track?.title ?? "", playing };
  // ---- what the owner built in this room (and the editor for the admin)
  const [doc, setDoc] = useState<RoomDoc>(emptyDoc), [editing, setEditing] = useState(false), [playTest, setPlayTest] = useState(false), [sel, setSel] = useState<string | null>(null);
  const [saved, setSaved] = useState<RoomDoc>(emptyDoc), [busy, setBusy] = useState(false), [err, setErr] = useState(""), editRef = useRef(false), playRef = useRef(false), docT = useRef(0);
  editRef.current = editing; playRef.current = playTest;
  const useDoc = useCallback((d: RoomDoc, slug: string, run: boolean) => { // make `d` the live content of the room
    const rt = new WireRuntime(d); rtRef.current = rt; docSlug.current = slug;
    actorLayer.slug = slug; actorLayer.doc = d; actorLayer.rt = rt; actorLayer.edit = editRef.current && !playRef.current;
    if (run) rt.start(performance.now() / 1000);
    dirty.current = true; wakeRef.current();
  }, []);
  useEffect(() => { // load the room's document
    let dead = false; setEditing(false); setPlayTest(false); setSel(null); setErr("");
    getJson<{ version: number; doc: unknown }>(`/api/room-doc/${world.slug}`).then((r) => {
      if (dead) return; const d = cleanDoc({ ...(r.doc as object), version: r.version }); setDoc(d); setSaved(d); useDoc(d, world.slug, true);
    }).catch(() => { if (!dead) { const d = emptyDoc(); setDoc(d); setSaved(d); useDoc(d, world.slug, false); } });
    return () => { dead = true; if (actorLayer.slug === world.slug) { actorLayer.doc = null; actorLayer.rt = null; actorLayer.slug = ""; } rtRef.current = null; window.clearTimeout(docT.current); };
  }, [world.slug, useDoc]);
  const changeDoc = useCallback((d: RoomDoc) => { setDoc(d); useDoc(d, wref.current.slug, false); }, [useDoc]);
  const setPlay = useCallback((on: boolean) => { setPlayTest(on); playRef.current = on; useDoc(doc, wref.current.slug, on); }, [doc, useDoc]);
  const closeEditor = useCallback(() => { setEditing(false); setPlayTest(false); editRef.current = false; playRef.current = false; actorLayer.edit = false; useDoc(saved, wref.current.slug, true); setDoc(saved); }, [saved, useDoc]);
  const saveDoc = useCallback(async () => {
    setBusy(true); setErr("");
    try { const r = await api<{ version: number; doc: RoomDoc }>(`/api/admin/room-doc/${wref.current.slug}`, { method: "PUT", body: JSON.stringify({ doc, baseVersion: saved.version }) }); clearShared(); const d = cleanDoc(r.doc); setSaved(d); setDoc(d); useDoc(d, wref.current.slug, false); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not save"); } finally { setBusy(false); }
  }, [doc, saved, useDoc]);
  const sameDoc = JSON.stringify({ a: doc.actors, w: doc.wires }) === JSON.stringify({ a: saved.actors, w: saved.wires });
  useEffect(() => { dirty.current = true; wakeRef.current(); }, [track?.id, playing, droneOn]);
  useEffect(() => { const on = () => setDroneOn(droneWanted()); window.addEventListener("exomusica-drone-pref", on); return () => window.removeEventListener("exomusica-drone-pref", on); }, []);

  useEffect(() => { // a different room from outside (not one we walked into): start at its spawn
    if (world === wref.current) return;
    wref.current = world; linkRef.current = null; sp.current.nextPainter = null; spaceRef.current = "cur"; wantedRef.current = null; waitRef.current = 0; lock.current = null;
    eye.current = { ...world.spawn, pitch: 0 }; drone.current = startDrone(eye.current); dview.current.d = drone.current; dirty.current = true; wakeRef.current();
  }, [world]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { dirty.current = true; wakeRef.current(); }, [tick]);
  const fitRef = useRef(() => {});
  const flushDs = useCallback(() => { // the test/debug attributes: written at most every 100 ms while moving, and always once the room goes still
    const st = stage.current; if (!st) return; const e = eye.current, hh = dview.current.hit;
    st.dataset.x = e.x.toFixed(2); st.dataset.z = e.z.toFixed(2); st.dataset.yaw = e.yaw.toFixed(3); st.dataset.pitch = e.pitch.toFixed(3); st.dataset.target = shown.current; st.dataset.lock = lock.current ? lock.current.id : "";
    st.dataset.scale = String(gov.current.scale); st.dataset.drone = droneOnRef.current && hh ? `${Math.round(hh.x)},${Math.round(hh.y)}` : ""; st.dataset.drawn = String(drawn.current); st.dataset.space = spaceRef.current; st.dataset.link = linkRef.current ? `${linkRef.current.next.slug}:${linkRef.current.open.toFixed(2)}` : ""; st.dataset.room = wref.current.slug; st.dataset.ghosts = String(gpool.current.count); st.dataset.chat = String(wref.current.chat?.length ?? 0);
    st.dataset.echo = echo.current?.busy(performance.now()) ? "1" : ""; st.dataset.scan = scanSt.current ? scanView.current.p.toFixed(2) : "";
  }, []);
  const showToast = useCallback((s: string) => { const t = toast.current; if (!t) return; t.textContent = s; t.style.opacity = "1"; window.clearTimeout((t as unknown as { _t?: number })._t); (t as unknown as { _t?: number })._t = window.setTimeout(() => { t.style.opacity = "0"; }, 1800); }, []);

  /** What the visor and scanner know about the room you are in: built once per room (and again when you walk into the next). */
  const ensureFx = useCallback((W: RoomWorld) => {
    if (fxWorld.current === W) return;
    fxWorld.current = W; const list = scannables(W); scanList.current = list;
    const f = new EchoField(list, (id) => W.doors.findIndex((d) => d.id === id)); const done = scannedIds(); list.forEach((x, i) => { f.scanned[i] = done.has(scanId("lore", x.key)) ? 1 : 0; }); echo.current = f;
    scanSt.current = null; noteRoom(W, list);
  }, []);
  const showCard = useCallback((c: ShownLore) => { setCard(c); window.clearTimeout(cardT.current); cardT.current = window.setTimeout(() => setCard(null), CARD_MS); }, []);
  const doPing = useCallback(() => {
    if (pausedRef.current) return;
    const v = visorRef.current; if (!v.on) { showToast(v.hint); return; }
    const W = wref.current; ensureFx(W); const f = echo.current!, e = eye.current;
    if (!f.ping(performance.now(), e.x, e.z)) { showToast("The visor is still ringing"); return; }
    playEcho(W, f, e.x, e.z, e.yaw); dirty.current = true; wakeRef.current();
  }, [ensureFx, showToast]);
  const startScan = useCallback(() => {
    if (pausedRef.current || traveling.current) return;
    const W = wref.current; ensureFx(W); const e = eye.current; let id: string | null = null, kind = "";
    const l = lock.current ?? pickLock(W, e, NO_PEOPLE_ITER); if (l && l.kind !== "person") { id = l.id; kind = l.kind; }
    const s = id ? scanList.current.find((x) => x.id === id && (x.lockKind === kind)) : undefined;
    if (!s) { showToast("Nothing to scan here"); return; }
    if (scannedIds().has(scanId("lore", s.key))) { showCard(shownOf(s, loreRef.current)); return; }
    scanSt.current = { s, t0: performance.now() }; dirty.current = true; wakeRef.current();
  }, [ensureFx, showToast, showCard]);

  /** Open the door to the room that was loaded for it: the corridor appears and the door starts to open. */
  const openLink = useCallback((d: RoomDoor): boolean => {
    const n = nextRef.current; if (!n || n.slug !== d.toSlug || linkRef.current) return false;
    const L = buildLink(wref.current, d, n, 0); if (!L) return false;
    linkRef.current = L; sp.current.nextPainter = painterFor(n, n.color ?? color); dirty.current = true; return true;
  }, [color]);

  const use = useCallback(() => {
    if (traveling.current || pausedRef.current) return;
    const W = wref.current, t = facing(W, eye.current); if (!t) return;
    if (t.kind === "door") {
      const d = t.door;
      if (d.state === "open" && d.toSlug) {
        if (linkRef.current && linkRef.current.door.id === d.id) return; // it is opening: walk in
        if (openLink(d)) { wakeRef.current(); return; }
        if (!nextRef.current || nextRef.current.slug !== d.toSlug) { wantedRef.current = d.toSlug; wantNextRef.current(d.toSlug); showToast("Opening…"); waitRef.current = waitRef.current || performance.now(); return; }
        traveling.current = true; go(`/branch/${d.toSlug}/room?from=${encodeURIComponent(W.slug)}`, true); // no corridor possible: the old way
      } else { showToast("Sealed. You have not found that room yet."); onLocked(); }
    } else onProp(t.prop);
  }, [go, onLocked, onProp, showToast, openLink]);

  const turnTo = useCallback((yaw: number) => { eye.current = { ...eye.current, yaw: wrapYaw(yaw) }; dirty.current = true; wake(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const frame = useCallback((now: number) => {
    raf.current = 0;
    const c = canvas.current, st = stage.current; if (!c || !st) return;
    const dt = Math.min(0.05, last.current ? (now - last.current) / 1000 : 0.016); last.current = now;
    const k = keys.current, still = pausedRef.current; let f = 0, s = 0, tr = 0, lk = 0;
    const gliding = glide(others.current, dt); let aimMoved = false;
    if (!still) for (const code of k) { const v = KEYS[code]; if (v) { f += v[0]; s += v[1]; tr += v[2]; lk += v[3]; } }
    if (!still) { f += stick.current.y; s += stick.current.x; }
    let W = wref.current;
    const run = k.has("ShiftLeft") || k.has("ShiftRight") || Math.hypot(stick.current.x, stick.current.y) > 0.93;
    const la = lookAcc.current; lookAcc.current = { yaw: 0, pitch: 0 };
    let e = eye.current;
    if (lock.current && !still) { // locked on: the view follows the target, keys and drags no longer turn it
      const nl = refreshLock(lock.current, W, e, others.current.values());
      if (!nl) { lock.current = null; setLocked(false); showToast("Lock lost"); } else { lock.current = nl; const a2 = aimAt(e, nl, dt); if (Math.abs(a2.yaw - e.yaw) + Math.abs(a2.pitch - e.pitch) > 1e-4) aimMoved = true; e = a2; tr = 0; lk = 0; la.yaw = 0; la.pitch = 0; }
    }
    if (la.yaw || la.pitch) e = { ...e, yaw: wrapYaw(e.yaw + la.yaw), pitch: clamp(e.pitch + la.pitch, -MAX_PITCH, MAX_PITCH) };
    const r = still ? { eye: e, into: null as { nx: number; nz: number; edge: number } | null, moved: false } : stepEye(W, e, { forward: clamp(f, -1, 1), strafe: clamp(s, -1, 1), turn: clamp(tr, -1, 1), look: clamp(lk, -1, 1), run }, dt, solve);
    let linkMoved = false, docMoved = false;
    const rt = rtRef.current;
    if (rt && !still && docSlug.current === W.slug && (!editRef.current || playRef.current)) { // triggers, delayed wires
      const ts = now / 1000; rt.probe(r.eye.x, r.eye.z, ts); rt.tick(ts);
      if (rt.changed.length) { rt.drain(); docMoved = true; }
      if (rt.pending) { window.clearTimeout(docT.current); docT.current = window.setTimeout(() => wakeRef.current(), Math.max(16, Math.min(60000, rt.nextDue() * 1000 - performance.now()))); }
    }
    if (!still) { // the corridor: through the door into the next room, the door that opens as you come near, the one that shuts behind you
      const L0 = linkRef.current;
      if (L0 && crossed(L0, r.eye.x, r.eye.z)) { // the far room is now the one you are in
        const old = W, nxt = L0.next;
        r.eye = { ...r.eye, x: r.eye.x - L0.offx, z: r.eye.z - L0.offz }; r.into = null; r.moved = true;
        drone.current.x -= L0.offx; drone.current.z -= L0.offz;
        linkRef.current = flipLink(L0, old); sp.current.nextPainter = painterFor(old, old.color ?? color);
        wref.current = nxt; W = nxt; wantedRef.current = null; waitRef.current = 0; lock.current = null; setLocked(false); others.current.clear(); ghosts.current = []; gpool.current.count = 0;
        advanceRef.current(nxt.slug);
      }
      const L = linkRef.current, space = eyeSpace(W, L, r.eye.x, r.eye.z); spaceRef.current = space;
      let nd: RoomDoor | null = null, ndd = Infinity;
      for (const d of W.doors) if (d.state === "open" && d.toSlug) { const dd = Math.hypot(d.x - r.eye.x, d.z - r.eye.z); if (dd < ndd) { ndd = dd; nd = d; } }
      if (L) {
        const dL = Math.hypot(L.door.x - r.eye.x, L.door.z - r.eye.z), other = !!nd && nd.id !== L.door.id && ndd < dL - 0.5 && ndd < OPEN_R, keep = space === "corridor" || (dL < KEEP_R && !other), was = L.open;
        L.open = keep ? Math.min(1, L.open + dt * OPEN_RATE) : Math.max(0, L.open - dt * OPEN_RATE);
        if (L.open !== was) linkMoved = true;
        if (L.open <= 0) { linkRef.current = null; sp.current.nextPainter = null; wantedRef.current = null; wantNextRef.current(null); linkMoved = true; }
      } else {
        if (nd && ndd < OPEN_R && openLink(nd)) linkMoved = true;
        const want = nd && ndd < WANT_R ? nd.toSlug : null;
        if (want !== wantedRef.current) { wantedRef.current = want; wantNextRef.current(want); }
      }
    }
    const wantsDrone = droneOnRef.current, a = audioRef.current;
    const droneMoved = wantsDrone ? stepDrone(drone.current, r.eye, spaceRef.current === "corridor" ? null : W, a.playing ? now / 1000 : 0, dt) : false;
    ensureFx(W); const ef = echo.current!;
    if (ef.live) ef.step(now);
    const echoBusy = ef.busy(now), echoTick = echoBusy && (now - ef.t0 < 2300 || now - lastPaint.current >= 80);
    let ghostTick = false;
    if (ghosts.current.length) { const gp = gpool.current, Wc = W; stepGhosts(ghosts.current, Date.now(), gp, others.current, (x, z) => inRoom(Wc, x, z, -0.2)); ghostTick = gp.active && now - lastPaint.current >= 66; } else if (gpool.current.count || gpool.current.active) { gpool.current.count = 0; gpool.current.active = false; }
    let scanTick = false;
    if (scanSt.current) { // a scan: needs the thing to stay within reach and roughly in front
      const sc = scanSt.current, e2 = r.eye, dx = sc.s.x - e2.x, dz = sc.s.z - e2.z, d = Math.hypot(dx, dz), cos = d < 1e-6 ? 1 : (dx * Math.cos(e2.yaw) + dz * Math.sin(e2.yaw)) / d, p = (now - sc.t0) / SCAN_MS;
      if (still || d > SCAN_REACH || cos < 0.2) { scanSt.current = null; scanView.current.p = 0; showToast("Scan lost"); scanTick = true; }
      else if (p >= 1) {
        scanSt.current = null; scanView.current.p = 0; scanTick = true;
        recordScan("lore", sc.s.key, userRef.current); playScan();
        const sh = shownOf(sc.s, loreRef.current); addLog({ key: sc.s.key, room: W.slug, title: sh.title, text: sh.text, owner: sh.owner, at: Date.now() });
        const i = scanList.current.indexOf(sc.s); if (i >= 0) ef.scanned[i] = 1;
        showCard(sh);
      } else { const v = scanView.current; v.x = sc.s.x; v.y = sc.s.y; v.z = sc.s.z; v.p = p; scanTick = true; }
    }
    const animating = wantsDrone && a.playing && !document.hidden; // a playing drone breathes: repaint about 11 times a second, not 60
    const tick = animating && now - lastPaint.current >= 90;
    const changed = r.moved || !!la.yaw || !!la.pitch || gliding || droneMoved || tick || aimMoved || linkMoved || echoTick || scanTick || ghostTick || docMoved; eye.current = r.eye;
    if (!traveling.current && !still) {
      const d = doorWalkedInto(W, r.eye, r.into);
      if (d?.toSlug) { // walked into a door whose corridor is not there yet: wait for the room behind it, and only if it never comes, cut to it the old way
        if (linkRef.current) { /* opening */ }
        else if (nextRef.current?.slug === d.toSlug && openLink(d)) { /* opens now */ }
        else if (!waitRef.current) { waitRef.current = now; wantedRef.current = d.toSlug; wantNextRef.current(d.toSlug); showToast("Opening…"); }
        else if (now - waitRef.current > 2500) { traveling.current = true; go(`/branch/${d.toSlug}/room?from=${encodeURIComponent(W.slug)}`, true); }
      }
      else if (r.into && W.doors.some((x) => x.edge === r.into!.edge && x.state === "locked" && Math.abs((r.eye.x - x.x) * x.tx + (r.eye.z - x.z) * x.tz) <= x.hw)) { if (!bumped.current) { bumped.current = true; showToast("Sealed. You have not found that room yet."); onLocked(); } }
      else if (!r.into) { bumped.current = false; waitRef.current = 0; }
    }
    if (changed || dirty.current || pendingPaint.current) {
      const t = facing(W, r.eye); tgt.current = t;
      const label = t ? t.label : lock.current ? `Locked: ${lock.current.label}` : "";
      if (label !== shown.current) { shown.current = label; if (prompt.current) { prompt.current.textContent = label; prompt.current.style.opacity = label ? "1" : "0"; } }
      link.current?.sendPose(r.eye.x, r.eye.z, r.eye.yaw);
      if (now - dsAt.current > 100) { dsAt.current = now; st.dataset.x = r.eye.x.toFixed(2); st.dataset.z = r.eye.z.toFixed(2); st.dataset.yaw = r.eye.yaw.toFixed(3); st.dataset.pitch = r.eye.pitch.toFixed(3); st.dataset.target = label; st.dataset.lock = lock.current ? lock.current.id : ""; st.dataset.space = spaceRef.current; st.dataset.link = linkRef.current ? `${linkRef.current.next.slug}:${linkRef.current.open.toFixed(2)}` : ""; st.dataset.room = W.slug; st.dataset.ghosts = String(gpool.current.count); st.dataset.chat = String(W.chat?.length ?? 0); st.dataset.echo = echoBusy ? "1" : ""; st.dataset.scan = scanSt.current ? scanView.current.p.toFixed(2) : ""; }
      if (gov.current.minGap && now - lastPaint.current < gov.current.minGap) pendingPaint.current = true; // slow device: paint at ~30 fps
      else {
        pendingPaint.current = false; dirty.current = false;
        const w = size.current.w, h = size.current.h;
        if (w && h) {
          const ctx = c.getContext("2d");
          if (ctx) {
            lastPaint.current = now; const dv = dview.current; dv.playing = a.playing; dv.title = a.title; dv.t = now / 1000;
            const fv = fxv.current; fv.now = now; fv.echo = echoBusy ? ef : null; fv.scan = scanSt.current ? scanView.current : null;
            const L = linkRef.current, spo = sp.current; spo.link = L; spo.open = L ? L.open : 0; spo.corridor = !!L && spaceRef.current === "corridor";
            const t0 = performance.now(); const stt = paintRoom(ctx, w, h, W, r.eye, W.color ?? color, t, (() => { const gp = gpool.current; if (!others.current.size && !gp.count) return NO_ONE; const dl = drawList.current; dl.length = 0; for (const o of others.current.values()) dl.push(o); for (let i = 0; i < gp.count; i++) dl.push(gp.items[i]); return dl; })(), wantsDrone ? dv : null, lock.current, L ? spo : null, fv); const ms = (performance.now() - t0) * perfMul.current;
            if (!wantsDrone) dv.hit = null;
            if (gov.current.observe(ms, now) !== null) { fitRef.current(); dirty.current = true; }
            if (perfOn.current && perfEl.current && now - perfAt.current > 500) { perfAt.current = now; perfEl.current.textContent = `${gov.current.averageMs.toFixed(1)} ms avg · ${gov.current.p95().toFixed(1)} p95 · scale ${gov.current.scale} · ${stt.polys} polys`; }
          }
        }
        ++drawn.current; if (now - dsAt2.current > 100) { dsAt2.current = now; st.dataset.scale = String(gov.current.scale); const hh = dview.current.hit; st.dataset.drone = wantsDrone && hh ? `${Math.round(hh.x)},${Math.round(hh.y)}` : ""; st.dataset.drawn = String(drawn.current); }
      }
    }
    const more = !!(changed || animating || echoBusy || pendingPaint.current || dirty.current || (!still && (k.size || stick.current.x || stick.current.y || drag.current)));
    if (more || gpool.current.active) raf.current = requestAnimationFrame(frame); else { last.current = 0; flushDs(); if (ghosts.current.length) { window.clearTimeout(ghostT.current); ghostT.current = window.setTimeout(() => wakeRef.current(), Math.min(30000, Math.max(250, gpool.current.nextStartMs)) + 40); } }
  }, [color, go, onLocked, showToast, flushDs, solve, openLink, ensureFx, showCard]);

  function wake() { if (!raf.current) raf.current = requestAnimationFrame(frame); }
  const wakeRef = useRef(wake); wakeRef.current = wake;

  // size the canvas to the stage (device pixels capped: 1.5, or 1 on small CPUs)
  useEffect(() => {
    const st = stage.current, c = canvas.current; if (!st || !c) return;
    const fit = () => { // device pixels capped (1.5, or 1 on small CPUs), then scaled down by the governor when painting is slow
      const w = st.clientWidth, h = st.clientHeight; dprBase.current = Math.min(window.devicePixelRatio || 1, (navigator.hardwareConcurrency ?? 8) <= 4 ? 1 : 1.5);
      const dpr = dprBase.current * gov.current.scale;
      c.width = Math.max(1, Math.round(w * dpr)); c.height = Math.max(1, Math.round(h * dpr)); size.current = { w, h };
      c.getContext("2d")?.setTransform(dpr, 0, 0, dpr, 0, 0); dirty.current = true; wakeRef.current();
    };
    fitRef.current = fit;
    fit(); const ro = new ResizeObserver(fit); ro.observe(st); return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (pausedRef.current || isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === "Space" || e.code === "Enter" || e.code === "KeyF") { if (e.code === "Enter" && (e.target as HTMLElement)?.closest?.("a,button")) return; e.preventDefault(); e.stopPropagation(); if (!e.repeat) use(); return; }
      if (e.code === "KeyZ") { e.preventDefault(); e.stopPropagation(); if (!e.repeat) toggleLockRef.current(); return; }
      if (e.code === "KeyV") { e.preventDefault(); e.stopPropagation(); if (!e.repeat) doPingRef.current(); return; }
      if (e.code === "KeyX") { e.preventDefault(); e.stopPropagation(); if (!e.repeat) startScanRef.current(); return; }
      if (e.code === "KeyL") { e.preventDefault(); e.stopPropagation(); if (!e.repeat) logbookRef.current(); return; }
      if (e.code === "KeyC") { e.preventDefault(); e.stopPropagation(); if (!e.repeat) callDroneRef.current(); return; }
      if (KEYS[e.code] || e.code === "ShiftLeft" || e.code === "ShiftRight") { e.preventDefault(); e.stopPropagation(); keys.current.add(e.code); wakeRef.current(); }
    };
    const up = (e: KeyboardEvent) => { keys.current.delete(e.code); };
    const blur = () => { keys.current.clear(); stick.current = { x: 0, y: 0 }; };
    window.addEventListener("keydown", down, true); window.addEventListener("keyup", up, true); window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", down, true); window.removeEventListener("keyup", up, true); window.removeEventListener("blur", blur); };
  }, [use]);
  useEffect(() => () => { cancelAnimationFrame(raf.current); raf.current = 0; }, []); // stop the loop only when the room goes away, not when a handler is swapped

  useEffect(() => { if (paused) { lock.current = null; setLocked(false); keys.current.clear(); stick.current = { x: 0, y: 0 }; drag.current = null; } else { stage.current?.focus({ preventScroll: true }); dirty.current = true; wakeRef.current(); } }, [paused]);
  useEffect(() => {
    if (!visible) { others.current.clear(); ghosts.current = []; gpool.current.count = 0; gpool.current.active = false; setHere(0); dirty.current = true; wakeRef.current(); return; }
    link.current = joinRoom(world.slug, (l) => { applyList(others.current, l); setHere(l.length); dirty.current = true; wakeRef.current(); }, (l) => { ghosts.current = parseGhosts(l); dirty.current = true; wakeRef.current(); });
    dirty.current = true; wakeRef.current();
    return () => { link.current?.close(); link.current = null; others.current.clear(); ghosts.current = []; gpool.current.count = 0; gpool.current.active = false; window.clearTimeout(ghostT.current); };
  }, [world.slug, visible]);

  const toggleLock = useCallback(() => {
    if (pausedRef.current) return;
    if (lock.current) { lock.current = null; setLocked(false); showToast("Lock released"); dirty.current = true; wakeRef.current(); return; }
    const l = pickLock(wref.current, eye.current, others.current.values());
    if (!l) { showToast("Nothing to lock on to"); return; }
    lock.current = l; setLocked(true); dirty.current = true; wakeRef.current();
  }, [showToast]);
  const toggleLockRef = useRef(toggleLock); toggleLockRef.current = toggleLock;
  const doPingRef = useRef(doPing); doPingRef.current = doPing; const startScanRef = useRef(startScan); startScanRef.current = startScan;
  const callDroneRef = useRef(() => {});
  const callDrone = () => { if (!droneOnRef.current) { setDroneOn(true); setDroneWanted(true); } onDrone(); };
  callDroneRef.current = callDrone;
  const onStick = useCallback((x: number, y: number) => { stick.current = { x, y }; wakeRef.current(); }, []);
  const pdown = (e: React.PointerEvent) => { if (pausedRef.current) return; if (e.button === 2) { e.preventDefault(); toggleLockRef.current(); return; } if (drag.current) return; drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0, type: e.pointerType }; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* synthetic */ } stage.current?.focus({ preventScroll: true }); };
  const pmove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y; d.x = e.clientX; d.y = e.clientY; d.moved += Math.abs(dx) + Math.abs(dy);
    lookAcc.current.yaw += dx * 0.006; lookAcc.current.pitch -= dy * 0.004; wakeRef.current();
  };
  const pup = (e: React.PointerEvent) => { const d = drag.current; if (!d || d.id !== e.pointerId) return; drag.current = null; if (d.moved < 6 && e.type === "pointerup") {
      const h = dview.current.hit, rc = stage.current?.getBoundingClientRect();
      if (h && rc && droneOnRef.current && Math.hypot(e.clientX - rc.left - h.x, e.clientY - rc.top - h.y) <= Math.max(30, h.r * 1.9)) { onDrone(); return; }
      if (d.type === "mouse") use();
    }
  };

  return (
    <div className="rm" data-testid="branch-room" style={{ ["--rm" as string]: color }}>
      <div ref={stage} className="rm-stage" tabIndex={0} aria-label={`${world.name}: walk with W A S D or the arrow keys, Space to use`} data-testid="room-stage" data-room={world.slug}
        onContextMenu={(e) => e.preventDefault()} onPointerDown={pdown} onPointerMove={pmove} onPointerUp={pup} onPointerCancel={pup}>
        <canvas ref={canvas} />
      </div>
      <div className="rm-scan" aria-hidden="true" />
      <div className="rm-title">{world.name}{here > 0 && <span data-testid="room-here" className="rm-here"> · {here} here</span>}</div>
      <div ref={prompt} className="rm-prompt" data-testid="room-prompt" aria-live="polite" />
      <div ref={toast} className="rm-toast" role="status" />
      {card && <div className="rm-card" data-testid="room-scan-card" role="status"><b>{card.title}</b><p>{card.text}</p>{card.owner && <i>✦ lore</i>}</div>}
      {perfOn.current && <div ref={perfEl} className="rm-perf" data-testid="room-perf" />}
      <div className="rm-bar">
        <Link to={backHref} className="rm-btn" data-testid="room-back" title="The ordinary page of this branch">Classic view</Link>
        <Link to={mapHref} className="rm-btn" data-testid="room-map">Map</Link>
        <button type="button" className="rm-btn" data-testid="room-drone" onClick={callDrone}>Drone</button>
        <button type="button" className="rm-btn" data-testid="room-ping" aria-disabled={!visor.on} onClick={doPing}>Ping</button>
        <button type="button" className="rm-btn" data-testid="room-scan" onClick={startScan}>Scan</button>
        <button type="button" className="rm-btn" data-testid="room-logbook" onClick={onLogbook}>Logbook</button>
        {isAdmin && <button type="button" className="rm-btn" data-testid="room-edit" aria-pressed={editing} onClick={() => { if (editing) closeEditor(); else { setEditing(true); editRef.current = true; useDoc(doc, wref.current.slug, false); } }}>Edit room</button>}
        <button type="button" className="rm-btn" data-testid="room-lock" aria-pressed={locked} onClick={toggleLock}>{locked ? "Unlock" : "Lock on"}</button>
        <button type="button" className="rm-btn" aria-pressed={visible} data-testid="room-visible" title={visible ? "Others in this room can see you. Press to hide (you will not see them either)." : "You are hidden. Press to appear."} onClick={() => { const v = !visible; setVisible(v); setVis(v); }}>{visible ? "Visible" : "Hidden"}</button>
      </div>
      {isAdmin && editing && <RoomEditor world={world} doc={doc} onDoc={changeDoc} sel={sel} setSel={(id) => { setSel(id); actorLayer.sel = id; dirty.current = true; wakeRef.current(); }} where={() => eye.current} dirty={!sameDoc} busy={busy} error={err} playing={playTest} onPlay={setPlay} onSave={saveDoc} onRevert={() => { setDoc(saved); useDoc(saved, wref.current.slug, false); }} onClose={closeEditor} />}
      <div className="rm-pad"><RoomStick onChange={onStick} /></div>
      <button type="button" className="rm-use" data-testid="room-use" onClick={() => { use(); }} onPointerDown={(e) => e.stopPropagation()}>Use</button>
      <p className="rm-hint">W A S D move · arrows look · Q E turn · Space use · right-click / Z lock on · X scan · V ping · L logbook · C drone · Esc leave</p>
      <ul className="sr-only">
        {world.doors.map((d) => (
          <li key={d.id}>
            <button type="button" data-testid={`face-${d.id}`} onClick={() => turnTo(Math.atan2(d.z - eye.current.z, d.x - eye.current.x))}>
              {d.state === "open" ? `Face the door to ${d.name}` : "Face a sealed door"}
            </button>
          </li>
        ))}
        {world.plaque && <li><button type="button" data-testid="face-plaque" onClick={() => turnTo(Math.atan2(world.plaque!.z - eye.current.z, world.plaque!.x - eye.current.x))}>Face the inscription on the wall</button></li>}
        {world.props.map((p) => (
          <li key={p.id}>
            <button type="button" data-prop={p.id} onClick={() => { const L = Math.hypot(p.x, p.z) || 1, ux = p.x / L, uz = p.z / L; const x = p.x - ux * 1.7, z = p.z - uz * 1.7; eye.current = { x, z, yaw: wrapYaw(Math.atan2(uz, ux)), pitch: 0 }; dirty.current = true; wakeRef.current(); }}>Walk up to: {p.label}</button>
            <Link to={p.href}>{p.label} (full page)</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
