import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { RoomDoor, RoomProp, RoomWorld } from "../lib/roomWorld";
import { startDrone, stepDrone, droneWanted, setDroneWanted } from "../lib/roomDrone";
import { useAudioStore } from "../lib/audioStore";
import { applyList, glide, isVisible, joinRoom, setVisible, type Shown } from "../lib/roomNet";
import { playSfx } from "../lib/roomSfx";
import { clamp, doorWalkedInto, facing, focalOf, MAX_PITCH, NEAR, stepEye, toCam, wrapYaw, type Eye, type P3, type Target } from "../lib/roomView";
import { actorLayer, corrLayer, painterFor, paintRoom, ScenePaint, type DroneView, type FxView } from "../lib/roomPaint";
import { loadMilestones } from "../lib/milestones";
import { BossPanel } from "./BossPanel";
import { bossKey, isBeaten, markBeaten } from "../lib/roomBoss";
import { type Actor, setPathT, hazardAt, groundAt, ceilAt, BODY, PROP_SLOPE, type HazardFx, cleanDoc, emptyDoc, pushOut, WireRuntime, type RoomDoc } from "../lib/roomDoc";
import { buildFloor } from "../lib/roomFloor";
import { getJson, clearShared } from "../lib/sharedGet";
import { api } from "../lib/api";
import { effectiveLook, themeKey } from "../lib/roomTheme";
import { corrKey, corrShift, corridorWorld, type CorrWorld } from "../lib/roomCorr";
import { onTexReady } from "../lib/roomTextures";
const RoomEditor = lazy(() => import("./RoomEditor").then((m) => ({ default: m.RoomEditor }))); // the editor is only downloaded when an admin opens it
import { makePool, parseGhosts, stepGhosts, type Ghost } from "../lib/roomGhosts";
import { buildLink, crossed, eyeSpace, flipLink, inRoom, resolveMove, type Link as RoomLink } from "../lib/roomScene";
import { ScaleGovernor } from "../lib/roomPerf";
import { aimAt, artifactLocks, pickLock, refreshLock, type Lock } from "../lib/roomLock";
import { isTypingTarget } from "../lib/isTypingTarget";
import { useAuth } from "../lib/auth";
import { recordScan, scannedIds, scanId } from "../lib/scanLog";
import { drawHud, hudOn, setHudOn, type HudIn, type ScanMark } from "../lib/visorHud";
import { EchoField } from "../lib/roomEcho";
import { playEcho, playScan } from "../lib/roomEchoAudio";
import { addLog, loadLog, noteRoom, surveyDraft, surveyKey, scannables, shownOf, type Lore, type Scannable, type ShownLore } from "../lib/roomLore";
import { RoomStick } from "./RoomStick";
import { ScanScreen, type ScanRes } from "./ScanScreen";
import { Glyph, RoomTile } from "./RoomGlyph";

const KEYS: Record<string, [number, number, number, number]> = { // forward, strafe, turn, look
  KeyW: [1, 0, 0, 0], KeyS: [-1, 0, 0, 0], ArrowUp: [0, 0, 0, 1], ArrowDown: [0, 0, 0, -1],
  KeyA: [0, -1, 0, 0], KeyD: [0, 1, 0, 0], ArrowLeft: [0, 0, -1, 0], ArrowRight: [0, 0, 1, 0], KeyQ: [0, 0, -1, 0], KeyE: [0, 0, 1, 0],
  PageUp: [0, 0, 0, 1], PageDown: [0, 0, 0, -1],
};
const NO_ONE: Shown[] = [];
const NO_PEOPLE_ITER: Shown[] = [];

const SCAN_MS = 1600, SCAN_REACH = 10, WANT_R = 6.5, OPEN_R = 4.4, KEEP_R = 5.4, OPEN_RATE = 2.4;
const scanProbe: P3 = [0, 0, 0], scanCam: P3 = [0, 0, 0]; // scratch for the scan visor's projection: no allocation per frame

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

/** The boss in reach: shown, within 4.5 m and in front of you. Nothing in the editor (unless playtesting). */
function bossNear(rt: WireRuntime | null, ready: boolean, e: Eye, editing: boolean): Actor | null {
  if (!rt || !ready || editing) return null; let best: Actor | null = null, bd = Infinity;
  for (const a of rt.doc.actors) {
    if (a.kind !== "boss" || !rt.isOn(a.id)) continue;
    const dx = a.x - e.x, dz = a.z - e.z, d = Math.hypot(dx, dz); if (d > 4.5) continue;
    const cos = d < 1e-6 ? 1 : (dx * Math.cos(e.yaw) + dz * Math.sin(e.yaw)) / d; if (cos < 0.6) continue;
    if (d < bd) { bd = d; best = a; }
  }
  return best;
}
/** The first-person room. Input is read into refs and the canvas is only drawn while something moves or changes, so a parked room costs nothing. */
export function BranchRoom({ tick, world, color, next, wantNext, onAdvance, go, mapHref, backHref, onLocked, onProp, paused, onDrone, visor, lore, onLogbook }: Props) {
  const stage = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null), prompt = useRef<HTMLDivElement>(null), toast = useRef<HTMLDivElement>(null);
  const alive = useRef(true), toastT = useRef(0); // alive: false once the room has unmounted (no frame may be requested after that)
  const wref = useRef(world), linkRef = useRef<RoomLink | null>(null), nextRef = useRef(next), wantedRef = useRef<string | null>(null), waitRef = useRef(0), spaceRef = useRef("cur");
  const sp = useRef(new ScenePaint()), wantNextRef = useRef(wantNext), advanceRef = useRef(onAdvance); nextRef.current = next; wantNextRef.current = wantNext; advanceRef.current = onAdvance;
  const shotRef = useRef<{ l: Lock; until: number } | null>(null), tpRef = useRef<{ x: number; z: number } | null>(null), moveAnim = useRef(false), surveyed = useRef(""), fyRef = useRef(0), jumpReq = useRef(false), [hasHeight, setHasHeight] = useState(false); // feet height (for the collision), a queued jump, whether this room has anything to climb
  const rtRef = useRef<WireRuntime | null>(null), docSlug = useRef(""), pushed = useRef({ x: 0, z: 0 });
  const solve = useRef((x: number, z: number) => {
    let r = resolveMove(wref.current, linkRef.current, x, z); const rt = rtRef.current;
    if (rt && docSlug.current === wref.current.slug && rt.doc.actors.length && pushOut(rt.doc, rt, r.x, r.z, 0.3, pushed.current, fyRef.current)) r = resolveMove(wref.current, linkRef.current, pushed.current.x, pushed.current.z);
    const C = corrLayer; if (C.rt && C.doc && C.doc.actors.length && linkRef.current && pushOut(C.doc, C.rt, r.x - C.ox, r.z - C.oz, 0.3, pushed.current, fyRef.current)) r = resolveMove(wref.current, linkRef.current, pushed.current.x + C.ox, pushed.current.z + C.oz); // the corridor's own solids
    return r;
  }).current;
  const { user } = useAuth(), isAdmin = !!user?.isAdmin, userRef = useRef(!!user); userRef.current = !!user;
  const visorRef = useRef(visor), loreRef = useRef(lore), logbookRef = useRef(onLogbook); visorRef.current = visor; loreRef.current = lore; logbookRef.current = onLogbook;
  const fxWorld = useRef<RoomWorld | null>(null), scanList = useRef<Scannable[]>([]), echo = useRef<EchoField | null>(null);
  const fxv = useRef<FxView>({ echo: null, now: 0, scan: null }), scanSt = useRef<{ s: Scannable; t0: number } | null>(null), scanView = useRef({ x: 0, y: 0, z: 0, p: 0 });
  const [boss, setBoss] = useState<Actor | null>(null);
  // the scan visor is a mode you stay in; its result (and the logbook entry one level deeper) opens over the room, which stands still meanwhile
  const [scanMode, setScanMode] = useState(false), scanModeRef = useRef(false), [scanRes, setScanRes] = useState<ScanRes | null>(null), scanResRef = useRef<ScanRes | null>(null);
  const eye = useRef<Eye>({ ...world.spawn, pitch: 0 });
  const keys = useRef(new Set<string>()), stick = useRef({ x: 0, y: 0 }), drag = useRef<{ id: number; x: number; y: number; moved: number; type: string } | null>(null);
  const dirty = useRef(true), raf = useRef(0), last = useRef(0), traveling = useRef(false), size = useRef({ w: 0, h: 0 }), tgt = useRef<Target | null>(null), shown = useRef(""), bumped = useRef(false);
  const lookAcc = useRef({ yaw: 0, pitch: 0 }), drawn = useRef(0);
  const ghosts = useRef<Ghost[]>([]), gpool = useRef(makePool()), drawList = useRef<Shown[]>([]), ghostT = useRef(0);
  const others = useRef(new Map<number, Shown>()), link = useRef<ReturnType<typeof joinRoom>>(null), pausedRef = useRef(paused), [visible, setVis] = useState(isVisible), [here, setHere] = useState(0);
  pausedRef.current = paused || !!boss || !!scanRes;
  const gov = useRef(new ScaleGovernor()), dprBase = useRef(1), lock = useRef<Lock | null>(null), [locked, setLocked] = useState(false), pendingPaint = useRef(false), prefetchAt = useRef(0), perfEl = useRef<HTMLDivElement>(null), perfAt = useRef(0), dsAt = useRef(0), dsAt2 = useRef(0);
  const perfMul = useRef(typeof location !== "undefined" ? Number(/[?&]perfmul=(\d+)/.exec(location.search)?.[1] ?? 1) : 1); // test hook: pretend the device is N times slower
  const perfOn = useRef(typeof location !== "undefined" && /[?&]perf\b/.test(location.search));
  const drone = useRef(startDrone({ ...world.spawn, pitch: 0 })), dview = useRef<DroneView>({ d: drone.current, playing: false, title: "", t: 0, hit: null }), lastPaint = useRef(0);
  const [droneOn, setDroneOn] = useState(droneWanted), droneOnRef = useRef(droneOn); droneOnRef.current = droneOn;
  const track = useAudioStore((s) => s.currentTrack), playing = useAudioStore((s) => s.isPlaying);
  const audioRef = useRef({ title: "", playing: false }); audioRef.current = { title: track?.title ?? "", playing };
  // ---- what the owner built in this room (and the editor for the admin)
  const [doc, setDoc] = useState<RoomDoc>(emptyDoc), [editing, setEditing] = useState(false), [playTest, setPlayTest] = useState(false), [sel, setSel] = useState<string | null>(null);
  const corrEdit = useRef<CorrWorld | null>(null), [corrW, setCorrW] = useState<CorrWorld | null>(null), [inCorr, setInCorr] = useState(false), stash = useRef<{ doc: RoomDoc; saved: RoomDoc } | null>(null), corrScan = useRef<Scannable[]>([]), corrT = useRef(0), lastLink = useRef<RoomLink | null>(null), lastSpace = useRef("cur"), corrAnim = useRef(false);
  const [saved, setSaved] = useState<RoomDoc>(emptyDoc), [busy, setBusy] = useState(false), [err, setErr] = useState(""), editRef = useRef(false), playRef = useRef(false), docT = useRef(0);
  editRef.current = editing; playRef.current = playTest;
  /** Artifacts you can lock onto and scan right now: showing, and visible to you (visor-only ones need the visor). */
  const syncArt = useCallback(() => {
    const rt = rtRef.current, d = actorLayer.doc, W = wref.current; actorLayer.visor = visorRef.current.on;
    const list: Lock[] = rt && d && actorLayer.slug === W.slug ? d.actors.filter((a) => a.kind === "artifact" && rt.isOn(a.id) && (!a.visor || visorRef.current.on)).map((a) => ({ kind: "artifact" as const, id: a.id, x: a.x, y: a.mode === 1 ? 0.3 : 1.3, z: a.z, label: a.name || "Artifact" })) : [];
    const C = corrLayer; // the corridor's artifacts too: ids carry "corr:" and the place is shifted into this room's frame
    if (C.rt && C.doc && linkRef.current) for (const a of C.doc.actors) if (a.kind === "artifact" && C.rt.isOn(a.id) && (!a.visor || visorRef.current.on)) list.push({ kind: "artifact", id: "corr:" + a.id, x: a.x + C.ox, y: a.mode === 1 ? 0.3 : 1.3, z: a.z + C.oz, label: a.name || "Artifact" });
    artifactLocks.list = list;
  }, []);
  /** The corridor's scannable things, in the frame of the room you are in. */
  const reshift = useCallback(() => {
    const C = corrLayer, d = C.doc;
    corrScan.current = d ? scannables({ slug: C.key, props: [], doors: [], plaque: null } as unknown as RoomWorld, d.actors.filter((a) => a.kind === "artifact").map((a) => ({ ...a, id: "corr:" + a.id, x: a.x + C.ox, z: a.z + C.oz }))).map((x) => ({ ...x, key: x.key.replace("/artifact/corr:", "/artifact/") })) : []; // the address has the real id, the lock a "corr:" one
    syncArt();
  }, [syncArt]);
  /** Milestone keys the community has reached (null until known): things with a gate appear or vanish by it. */
  const reachedRef = useRef<ReadonlySet<string> | null>(null);
  /** Hazards: integrity (1 = whole), whether the room / corridor has any, the effect under you right now. */
  const [hud, setHud] = useState(hudOn), hudRef = useRef(hud), hudC = useRef<HTMLCanvasElement>(null), hudAt = useRef(0), hudIn = useRef<HudIn | null>(null), hudOnAt = useRef(0), hudN = useRef({ at: 0, list: null as readonly { x: number; z: number }[] | null, flags: new Uint8Array(0), done: 0, marks: [] as ScanMark[], pool: [] as ScanMark[] });
  hudRef.current = hud;
  const hudMount = useCallback((el: HTMLCanvasElement | null) => { // size the visor canvas as it appears (it is created when the visor is switched on or the editor closes)
    hudC.current = el; const st = stage.current; if (!el || !st) return; const d = 1, w = st.clientWidth, h = st.clientHeight;
    el.width = Math.max(1, Math.round(w * d)); el.height = Math.max(1, Math.round(h * d)); el.getContext("2d")?.setTransform(d, 0, 0, d, 0, 0); hudAt.current = 0; hudOnAt.current = performance.now() / 1000; dirty.current = true; wakeRef.current();
  }, []);
  const integ = useRef(1), hazRoom = useRef(false), hazCorr = useRef(false), hz = useRef<HazardFx>({ slow: 1, px: 0, pz: 0, drain: 0 }), hz2 = useRef<HazardFx>({ slow: 1, px: 0, pz: 0, drain: 0 }), integEl = useRef<HTMLDivElement>(null), hurtEl = useRef<HTMLDivElement>(null), integShown = useRef(-1), softT = useRef(0);
  /** Wire messages for the player (teleport to a marker, say a line, play a sound); `ox`,`oz` shift a corridor's frame into the room's. */
  const actFn = useRef<(ox: number, oz: number, d: RoomDoc, id: string, msg: string, arg: string) => void>(() => {});
  /** Make `d` the live content of the corridor you are in or looking into (its things, its mood). */
  const useCorr = useCallback((d: RoomDoc | null, key: string, run: boolean) => {
    const C = corrLayer; C.key = key; C.doc = d; C.rt = d ? new WireRuntime(d, reachedRef.current) : null; hazCorr.current = !!d?.actors.some((x) => x.kind === "hazard"); if (C.rt && d) C.rt.onAct = (id, msg, arg) => actFn.current(C.ox, C.oz, d, id, msg, arg); C.edit = !!corrEdit.current && !playRef.current; C.sel = corrEdit.current ? C.sel : null; corrAnim.current = !!d?.actors.some((x) => x.pulse > 0 || x.prop === "drifter" || x.ptime > 0) || !!d?.tex.some((t) => t.scroll !== 0);
    if (d && C.rt && run) { const t0 = performance.now() / 1000; C.rt.start(t0); const done = scannedIds(); for (const a of d.actors) if (a.kind === "artifact" && done.has(scanId("lore", `room:${key}/artifact/${a.id}`))) C.rt.emit(a.id, "scanned", t0); }
    reshift(); dirty.current = true; wakeRef.current();
  }, [syncArt, reshift]);
  /** The link changed (a door opened, shut, or you crossed into the next room): load or drop the corridor's document and keep its shift right. */
  const syncCorr = useCallback(() => {
    const L = linkRef.current, W = wref.current, C = corrLayer;
    if (!L) { if (!corrEdit.current && C.doc) useCorr(null, "", false); return; }
    const key = corrKey(W.slug, L.next.slug), sh = corrShift(W.slug, L); C.ox = sh.ox; C.oz = sh.oz;
    if (corrEdit.current) { corrEdit.current = { ...corrEdit.current }; return; }
    if (C.key === key && C.doc) { reshift(); return; } // same corridor from the other side: keep its state, move it
    C.key = key; C.doc = null; C.rt = null;
    getJson<{ version: number; doc: unknown }>(`/api/room-doc/${key}`).then((r) => { if (corrLayer.key === key && !corrEdit.current && linkRef.current) useCorr(cleanDoc(r.doc), key, true); }).catch(() => {});
  }, [useCorr, reshift]);
  /** The look in effect: this room's own mood/sky/flock, else the nearest theme above. */
  const themeRef = useRef<{ slugs: string[]; docs: (RoomDoc | null)[] }>({ slugs: [], docs: [] }), [lookFrom, setLookFrom] = useState<{ grade: string | null; sky: string | null; flock: string | null }>({ grade: null, sky: null, flock: null }), [ownTheme, setOwnTheme] = useState(false), [themeMsg, setThemeMsg] = useState("");
  const applyLook = useCallback((d: RoomDoc) => {
    const th = themeRef.current, r = effectiveLook(d, th.docs, th.slugs); actorLayer.look = r.look; actorLayer.skyAnim = !!r.look.sky?.speed; actorLayer.flockAnim = !!r.look.flock; setLookFrom(r.from); dirty.current = true; wakeRef.current();
  }, []);
  const useDoc = useCallback((d: RoomDoc, slug: string, run: boolean) => { // make `d` the live content of the room
    const rt = new WireRuntime(d, reachedRef.current); rtRef.current = rt; docSlug.current = slug; for (const a of d.actors) if (a.kind === "boss" && isBeaten(bossKey(slug, a.id))) rt.done.add(a.id); hazRoom.current = d.actors.some((x) => x.kind === "hazard"); moveAnim.current = d.actors.some((x) => x.ptime > 0 && x.pmode !== 1); setHasHeight(d.actors.some((x) => x.kind === "solid" && (x.lift > 0 || (!!x.prop && PROP_SLOPE[x.prop] !== undefined)))); rt.onAct = (id, msg, arg) => actFn.current(0, 0, d, id, msg, arg);
    actorLayer.slug = slug; actorLayer.doc = d; actorLayer.rt = rt; actorLayer.floor = buildFloor(d.floor, d.tex); actorLayer.anim = !!actorLayer.floor?.scrolls || d.tex.some((t) => t.scroll !== 0) || d.actors.some((x) => x.pulse > 0 || x.prop === "drifter" || x.ptime > 0); actorLayer.edit = editRef.current && !playRef.current;
    if (run) { const t0 = performance.now() / 1000; rt.start(t0); const done = scannedIds(); for (const a of d.actors) { if (a.kind === "artifact" && done.has(scanId("lore", `room:${slug}/artifact/${a.id}`))) rt.emit(a.id, "scanned", t0); if (a.kind === "boss" && rt.done.has(a.id)) rt.emit(a.id, "defeated", t0); } } // what you already scanned or answered here stays so
    applyLook(d); fxWorld.current = null; syncArt(); // the scanner rebuilds its list with this room's artifacts
    dirty.current = true; wakeRef.current();
  }, [syncArt, applyLook]);
  /** Whatever is being edited (the room, or the corridor) becomes the live content. */
  const applyDoc = useCallback((d: RoomDoc, run: boolean) => { if (corrEdit.current) useCorr(d, corrEdit.current.world.slug, run); else useDoc(d, wref.current.slug, run); }, [useCorr, useDoc]);
  useEffect(() => { // the room behind the door you are walking to: fetch its document, its themes and the milestones now, so crossing finds everything ready and its look does not arrive late
    if (!next) return; const slugs = [next.slug, ...(next.lineage ?? []).slice(0, 8)];
    void getJson(`/api/room-doc/${next.slug}`).catch(() => undefined); for (const sl of slugs) void getJson(`/api/room-doc/${themeKey(sl)}`).catch(() => undefined); void loadMilestones().catch(() => undefined);
  }, [next]);
  useEffect(() => { // load the room's document
    if (corrEdit.current) { corrEdit.current = null; corrLayer.edit = false; stash.current = null; setCorrW(null); }
    hist.current = { undo: [], redo: [], key: "", at: 0 }; let dead = false; setEditing(false); setPlayTest(false); setSel(null); setErr(""); setThemeMsg("");
    const slugs = [world.slug, ...(world.lineage ?? []).slice(0, 8)]; themeRef.current = { slugs, docs: slugs.map(() => null) }; setOwnTheme(false);
    Promise.all(slugs.map((sl) => getJson<{ version: number; doc: unknown }>(`/api/room-doc/${themeKey(sl)}`).then((r) => (r.version > 0 ? cleanDoc(r.doc) : null)).catch(() => null))).then((docs) => {
      if (dead) return; themeRef.current = { slugs, docs }; setOwnTheme(!!docs[0]); applyLook(docRef.current);
    });
    const gates = reachedRef.current ? Promise.resolve() : loadMilestones().then((l) => { reachedRef.current = new Set(l.filter((m) => m.reached).map((m) => m.key)); }).catch(() => { reachedRef.current = new Set(); });
    Promise.all([getJson<{ version: number; doc: unknown }>(`/api/room-doc/${world.slug}`), gates]).then(([r]) => {
      if (dead) return; const d = cleanDoc({ ...(r.doc as object), version: r.version }); setDoc(d); setSaved(d); useDoc(d, world.slug, true);
    }).catch(() => { if (!dead) { const d = emptyDoc(); setDoc(d); setSaved(d); useDoc(d, world.slug, false); } });
    return () => { dead = true; if (actorLayer.slug === world.slug) { actorLayer.doc = null; actorLayer.rt = null; actorLayer.floor = null; actorLayer.slug = ""; artifactLocks.list = []; fxWorld.current = null; } rtRef.current = null; window.clearTimeout(docT.current); actorLayer.look = { grade: null, sky: null, flock: null }; };
  }, [world.slug, world.lineage, useDoc, applyLook]);
  useEffect(() => { syncArt(); dirty.current = true; wakeRef.current(); }, [visor.on, syncArt]);
  useEffect(() => onTexReady(() => { dirty.current = true; wakeRef.current(); }), []);
  const docRef = useRef(doc); docRef.current = doc;
  const hist = useRef<{ undo: RoomDoc[]; redo: RoomDoc[]; key: string; at: number }>({ undo: [], redo: [], key: "", at: 0 }), [, setHistN] = useState(0);
  const changeDoc = useCallback((d: RoomDoc, key = "") => { // `key` groups a drag or a brush stroke into one undo step
    const h = hist.current, t = performance.now();
    if (!(key && key === h.key && t - h.at < 900)) { h.undo.push(docRef.current); if (h.undo.length > 50) h.undo.shift(); }
    h.redo.length = 0; h.key = key; h.at = t; setHistN((n) => n + 1);
    setDoc(d); applyDoc(d, false);
  }, [applyDoc]);
  const undoDoc = useCallback(() => { const h = hist.current, p = h.undo.pop(); if (!p) return; h.redo.push(docRef.current); h.key = ""; setHistN((n) => n + 1); setDoc(p); applyDoc(p, false); }, [applyDoc]);
  const redoDoc = useCallback(() => { const h = hist.current, p = h.redo.pop(); if (!p) return; h.undo.push(docRef.current); h.key = ""; setHistN((n) => n + 1); setDoc(p); applyDoc(p, false); }, [applyDoc]);
  useEffect(() => {
    if (!editing) return;
    const k = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || isTypingTarget(e.target)) return;
      if (e.code === "KeyZ" && !e.shiftKey) { e.preventDefault(); undoDoc(); } else if ((e.code === "KeyZ" && e.shiftKey) || e.code === "KeyY") { e.preventDefault(); redoDoc(); }
    };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [editing, undoDoc, redoDoc]);
  const setPlay = useCallback((on: boolean) => { setPlayTest(on); playRef.current = on; applyDoc(doc, on); }, [doc, applyDoc]);
  const closeEditor = useCallback(() => {
    setEditing(false); setPlayTest(false); editRef.current = false; playRef.current = false; actorLayer.edit = false; corrLayer.edit = false;
    if (corrEdit.current) { const st = stash.current; corrLayer.sel = null; applyDoc(saved, true); corrLayer.edit = false; corrEdit.current = null; setCorrW(null); stash.current = null; if (st) { setDoc(st.doc); setSaved(st.saved); } return; }
    useDoc(saved, wref.current.slug, true); setDoc(saved);
  }, [saved, useDoc, applyDoc]);
  /** Edit the corridor you are standing in: its own document, its own plan. */
  const editCorridor = useCallback(async () => {
    const L = linkRef.current, W = wref.current; if (!L) return;
    const cw = corridorWorld(L, W.slug), sh = corrShift(W.slug, L); setErr("");
    let d: RoomDoc; try { const r = await api<{ version: number; doc: unknown }>(`/api/room-doc/${cw.world.slug}`); d = cleanDoc({ ...(r.doc as object), version: r.version }); } catch { d = emptyDoc(); }
    stash.current = { doc: docRef.current, saved }; corrLayer.ox = sh.ox; corrLayer.oz = sh.oz; corrEdit.current = cw; setCorrW(cw);
    hist.current = { undo: [], redo: [], key: "", at: 0 }; setSel(null); corrLayer.sel = null; setDoc(d); setSaved(d); editRef.current = true; setEditing(true); useCorr(d, cw.world.slug, false);
  }, [saved, useCorr]);
  const saveDoc = useCallback(async () => {
    setBusy(true); setErr("");
    try { const r = await api<{ version: number; doc: RoomDoc }>(`/api/admin/room-doc/${corrEdit.current ? corrEdit.current.world.slug : wref.current.slug}`, { method: "PUT", body: JSON.stringify({ doc, baseVersion: saved.version }) }); clearShared(); const d = cleanDoc(r.doc); setSaved(d); setDoc(d); applyDoc(d, false); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not save"); } finally { setBusy(false); }
  }, [doc, saved, applyDoc]);
  /** Make this room's own mood, sky and flock the theme of this branch and everything below it. */
  const saveTheme = useCallback(async () => {
    const W = wref.current, key = themeKey(W.slug), d = docRef.current; setThemeMsg("");
    if (!d.grade && !d.sky && !d.flock) { setThemeMsg("Set a mood, a sky or drifting specks first."); return; }
    setBusy(true);
    try {
      const cur = await api<{ version: number }>(`/api/room-doc/${key}`, { cache: "no-store" }).catch(() => ({ version: 0 }));
      const r = await api<{ version: number; doc: RoomDoc }>(`/api/admin/room-doc/${key}`, { method: "PUT", body: JSON.stringify({ doc: cleanDoc({ grade: d.grade, sky: d.sky, flock: d.flock }), baseVersion: cur.version }) });
      clearShared(); themeRef.current.docs[0] = cleanDoc(r.doc); setOwnTheme(true); applyLook(d); setThemeMsg("Saved: this branch and everything below now use this look unless a room sets its own.");
    } catch (e) { setThemeMsg(e instanceof Error ? e.message : "Could not save the theme"); } finally { setBusy(false); }
  }, [applyLook]);
  const clearTheme = useCallback(async () => {
    setThemeMsg(""); try { await api(`/api/admin/room-doc/${themeKey(wref.current.slug)}`, { method: "DELETE" }); clearShared(); themeRef.current.docs[0] = null; setOwnTheme(false); applyLook(docRef.current); setThemeMsg("Theme removed."); } catch (e) { setThemeMsg(e instanceof Error ? e.message : "Could not remove the theme"); }
  }, [applyLook]);
  const themeNote = useMemo(() => {
    const parts = (["grade", "sky", "flock"] as const).filter((k) => lookFrom[k]).map((k) => `${k === "grade" ? "mood" : k === "flock" ? "specks" : "sky"} from ${lookFrom[k]}`);
    return parts.length ? `Inherited: ${parts.join(", ")}.` : "Nothing inherited.";
  }, [lookFrom]);
  const sameDoc = JSON.stringify({ a: doc.actors, w: doc.wires, t: doc.tex, f: doc.floor, b: doc.bands, g: doc.grade, c: doc.ceil, k: doc.sky, fl: doc.flock, i: doc.inherit }) === JSON.stringify({ a: saved.actors, w: saved.wires, t: saved.tex, f: saved.floor, b: saved.bands, g: saved.grade, c: saved.ceil, k: saved.sky, fl: saved.flock, i: saved.inherit });
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
  const showToast = useCallback((s: string) => { const t = toast.current; if (!t) return; t.textContent = s; t.style.opacity = "1"; window.clearTimeout(toastT.current); toastT.current = window.setTimeout(() => { t.style.opacity = "0"; }, 1800); }, []);
  actFn.current = (ox, oz, d, id, msg, arg) => { // a wire told a marker to teleport you there, say something, or play a sound
    if (msg === "play") { playSfx(arg); return; }
    if (msg === "say") { showToast(arg); return; }
    if (msg === "shot") { const m = d.actors.find((x) => x.id === id); if (m) { shotRef.current = { l: { kind: "prop", id: "shot", x: m.x + ox, y: m.h || 1.6, z: m.z + oz, label: "" }, until: performance.now() + Number(arg) * 1000 }; lock.current = null; setLocked(false); dirty.current = true; wakeRef.current(); } return; }
    const m = d.actors.find((x) => x.id === id);
    if (msg === "teleport" && m) { tpRef.current = { x: m.x + ox, z: m.z + oz }; lock.current = null; setLocked(false); dirty.current = true; wakeRef.current(); }
  };

  /** What the visor and scanner know about the room you are in: built once per room (and again when you walk into the next). */
  const ensureFx = useCallback((W: RoomWorld) => {
    if (fxWorld.current === W) return;
    fxWorld.current = W; const dd = actorLayer.doc; const list = scannables(W, dd && actorLayer.slug === W.slug ? dd.actors.filter((a) => a.kind === "artifact") : []); scanList.current = list;
    const f = new EchoField(list, (id) => W.doors.findIndex((d) => d.id === id)); const done = scannedIds(); list.forEach((x, i) => { f.scanned[i] = done.has(scanId("lore", x.key)) ? 1 : 0; }); echo.current = f;
    scanSt.current = null; noteRoom(W, list);
  }, []);
  const doPing = useCallback(() => {
    if (pausedRef.current) return;
    const v = visorRef.current; if (!v.on) { showToast(v.hint); return; }
    const W = wref.current; ensureFx(W); const f = echo.current!, e = eye.current;
    if (!f.ping(performance.now(), e.x, e.z)) { showToast("The visor is still ringing"); return; }
    playEcho(W, f, e.x, e.z, e.yaw); dirty.current = true; wakeRef.current();
  }, [ensureFx, showToast]);
  /** The scan screen (the result, or the logbook entry one level deeper). The room stands still while it is open. */
  const setScreen = useCallback((r: ScanRes | null) => {
    scanResRef.current = r; if (r) { pausedRef.current = true; keys.current.clear(); stick.current = { x: 0, y: 0 }; }
    setScanRes(r); dirty.current = true; wakeRef.current();
  }, []);
  const openScan = useCallback((s: Scannable, view: "result" | "entry") => setScreen({ s, sh: shownOf(s, loreRef.current), view }), [setScreen]);
  /** The scan visor: on or off. You stay in it until you switch it off (a scan running then is lost). */
  const setMode = useCallback((on: boolean) => {
    if (!on) { scanSt.current = null; scanView.current.p = 0; }
    scanModeRef.current = on; setScanMode(on); hudAt.current = 0; dirty.current = true; wakeRef.current(); showToast(on ? "Scan visor" : "Combat visor");
  }, [showToast]);
  const toggleScan = useCallback(() => { if (pausedRef.current) return; setMode(!scanModeRef.current); }, [setMode]);
  /** The scan screen's keys and buttons: read the entry, go back one level, or leave the scan visor. */
  const scanAct = useCallback((act: "read" | "back" | "exit") => {
    const r = scanResRef.current; if (!r) return;
    if (act === "exit") { setScreen(null); setMode(false); }
    else if (act === "read" && r.view === "result") setScreen({ ...r, view: "entry" });
    else if (r.view === "entry") setScreen({ ...r, view: "result" });
    else setScreen(null);
    stage.current?.focus({ preventScroll: true });
  }, [setScreen, setMode]);

  const startScan = useCallback(() => {
    if (pausedRef.current || traveling.current) return;
    const W = wref.current; ensureFx(W); const e = eye.current; let id: string | null = null, kind = "";
    const l = lock.current ?? pickLock(W, e, NO_PEOPLE_ITER); if (l && l.kind !== "person") { id = l.id; kind = l.kind; }
    const s = id ? scanList.current.find((x) => x.id === id && (x.lockKind === kind)) ?? corrScan.current.find((x) => x.id === id && (x.lockKind === kind)) : undefined;
    if (!s) { showToast("Nothing to scan here"); return; }
    if (scannedIds().has(scanId("lore", s.key))) { openScan(s, "entry"); return; }
    scanSt.current = { s, t0: performance.now() }; dirty.current = true; wakeRef.current();
  }, [ensureFx, showToast, openScan]);

  /** Open the door to the room that was loaded for it: the corridor appears and the door starts to open. */
  const openLink = useCallback((d: RoomDoor): boolean => {
    const n = nextRef.current; if (!n || n.slug !== d.toSlug || linkRef.current) return false;
    const L = buildLink(wref.current, d, n, 0); if (!L) return false;
    linkRef.current = L; sp.current.nextPainter = painterFor(n, n.color ?? color); dirty.current = true; return true;
  }, [color]);

  const use = useCallback(() => {
    if (traveling.current || pausedRef.current) return;
    const W = wref.current, bn = bossNear(rtRef.current, docSlug.current === wref.current.slug, eye.current, editRef.current && !playRef.current);
    if (bn) { setBoss(bn); keys.current.clear(); return; }
    const t = facing(W, eye.current); if (!t) return;
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
    const dt = Math.min(0.05, last.current ? (now - last.current) / 1000 : 0.016); last.current = now; setPathT(Date.now() / 1000);
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
    const shot = shotRef.current;
    if (shot && !still) { // a camera shot: the view turns to look at the marker, hands off the controls
      if (now >= shot.until) shotRef.current = null;
      else { const a2 = aimAt(e, shot.l, dt); if (Math.abs(a2.yaw - e.yaw) + Math.abs(a2.pitch - e.pitch) > 1e-4) aimMoved = true; e = a2; f = 0; s = 0; tr = 0; lk = 0; la.yaw = 0; la.pitch = 0; }
    }
    if (la.yaw || la.pitch) e = { ...e, yaw: wrapYaw(e.yaw + la.yaw), pitch: clamp(e.pitch + la.pitch, -MAX_PITCH, MAX_PITCH) };
    fyRef.current = e.y ?? 0;
    const hzOn = !still && (hazRoom.current || hazCorr.current) && (!editRef.current || playRef.current); let slow = 1;
    if (hzOn) { // hazards under you: slower, drifting, or draining integrity
      const h = hz.current; h.slow = 1; h.px = 0; h.pz = 0; h.drain = 0; const rt0 = rtRef.current, C0 = corrLayer;
      if (hazRoom.current && rt0 && docSlug.current === W.slug) hazardAt(rt0.doc, rt0, e.x, e.z, h);
      if (hazCorr.current && C0.rt && C0.doc) { const q = hz2.current; hazardAt(C0.doc, C0.rt, e.x - C0.ox, e.z - C0.oz, q); h.slow = Math.min(h.slow, q.slow); h.px += q.px; h.pz += q.pz; h.drain += q.drain; }
      slow = h.slow;
    }
    const r = still ? { eye: e, into: null as { nx: number; nz: number; edge: number } | null, moved: false } : stepEye(W, e, { forward: clamp(f, -1, 1) * slow, strafe: clamp(s, -1, 1) * slow, turn: clamp(tr, -1, 1), look: clamp(lk, -1, 1), run }, dt, solve);
    let linkMoved = false, docMoved = false;
    if (hzOn) {
      const h = hz.current;
      if (h.px || h.pz) { const q = solve(r.eye.x + h.px * dt, r.eye.z + h.pz * dt); r.eye = { ...r.eye, x: q.x, z: q.z }; r.moved = true; }
      const before = integ.current;
      if (h.drain > 0) integ.current = Math.max(0, before - h.drain * dt); else if (before < 1) integ.current = Math.min(1, before + 0.2 * dt);
      if (integ.current <= 0 && !softT.current) { // never a fail screen: you are drawn gently back to the start, whole again
        softT.current = now; const sp0 = W.spawn; r.eye = { ...r.eye, x: sp0.x, z: sp0.z }; r.moved = true; integ.current = 0.6; showToast("Integrity low. You were drawn back."); lock.current = null; setLocked(false);
      }
      if (softT.current && now - softT.current > 1500) softT.current = 0;
    } else if (integ.current < 1 && !still) integ.current = Math.min(1, integ.current + 0.2 * dt);
    { const iv = Math.round(integ.current * 50), el = integEl.current; if (el && iv !== integShown.current) { integShown.current = iv; if (hurtEl.current) hurtEl.current.style.opacity = String(Math.round((1 - iv / 50) * 85) / 100); el.style.opacity = iv >= 50 ? "0" : "1"; (el.firstChild as HTMLElement).style.width = iv * 2 + "%"; } }
    { // height: stand on platforms and stairs, fall off edges, jump (J), bump your head
      const live = !still && (!editRef.current || playRef.current), rt1 = rtRef.current, d1 = rt1 && docSlug.current === W.slug ? rt1 : null;
      let fy = r.eye.y ?? 0, vy = r.eye.vy ?? 0;
      if (live) {
        const g = d1 ? groundAt(d1.doc, d1, r.eye.x, r.eye.z, fy) : 0;
        if (jumpReq.current && fy <= g + 0.02 && vy <= 0) vy = 4.2;
        if (vy <= 0 && g > 0 && fy > g && fy - g < 0.12) { fy = g; vy = 0; r.moved = true; } // riding a platform that sinks: stay on it
        else if (vy > 0 || fy > g + 0.02) {
          const was = fy; vy -= 11 * dt; fy += vy * dt;
          if (vy > 0 && d1) { const cl = ceilAt(d1.doc, d1, r.eye.x, r.eye.z, was); if (fy + BODY > cl) { fy = Math.max(was, cl - BODY); vy = 0; } }
          if (fy <= g) { fy = g; vy = 0; }
          r.moved = true;
        } else if (fy < g - 0.002) { fy += (g - fy) * Math.min(1, dt * 16); if (g - fy < 0.01) fy = g; r.moved = true; }
        else { fy = g; vy = 0; }
        fy = Math.min(fy, Math.max(0, W.H - BODY - 0.15));
      } else if (fy || vy) { fy = 0; vy = 0; r.moved = true; }
      jumpReq.current = false;
      if (fy !== (r.eye.y ?? 0) || vy !== (r.eye.vy ?? 0)) r.eye = { ...r.eye, y: fy, vy };
    }
    if (!still && surveyed.current !== W.slug && (!editRef.current || playRef.current) && docSlug.current === W.slug && Math.hypot(r.eye.x - W.spawn.x, r.eye.z - W.spawn.z) > 6 && spaceRef.current !== "corridor") { // explored: the room writes its Logbook entry (yours to edit; else made from the branch description)
      surveyed.current = W.slug; const key = surveyKey(W.slug);
      if (!loadLog()[key]) { const own = rtRef.current?.doc.log ?? ""; addLog({ key, room: W.slug, title: W.name, text: own || surveyDraft(W.name, W.blurb), owner: !!own, at: Date.now() }); showToast("Logbook: " + W.name); }
    }
    const rt = rtRef.current;
    if (rt && !still && docSlug.current === W.slug && (!editRef.current || playRef.current)) { // triggers, delayed wires
      const ts = now / 1000; rt.probe(r.eye.x, r.eye.z, ts); rt.tick(ts);
      if (rt.changed.length) { rt.drain(); docMoved = true; syncArt(); }
      if (rt.pending) { window.clearTimeout(docT.current); docT.current = window.setTimeout(() => wakeRef.current(), Math.max(16, Math.min(60000, rt.nextDue() * 1000 - performance.now()))); }
    }
    const Cr = corrLayer.rt;
    if (Cr && !still && linkRef.current && (!corrEdit.current || playRef.current)) { // the corridor's own triggers and wires
      const ts = now / 1000; Cr.probe(r.eye.x - corrLayer.ox, r.eye.z - corrLayer.oz, ts); Cr.tick(ts);
      if (Cr.changed.length) { Cr.drain(); docMoved = true; syncArt(); }
      if (Cr.pending) { window.clearTimeout(corrT.current); corrT.current = window.setTimeout(() => wakeRef.current(), Math.max(16, Math.min(60000, Cr.nextDue() * 1000 - performance.now()))); }
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
    if (linkRef.current !== lastLink.current) { lastLink.current = linkRef.current; syncCorr(); }
    if (spaceRef.current !== lastSpace.current) { lastSpace.current = spaceRef.current; setInCorr(spaceRef.current === "corridor"); }
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
        openScan(sc.s, "result");
        if (sc.s.what === "artifact" && sc.s.id.startsWith("corr:") && corrLayer.rt && (!corrEdit.current || playRef.current)) { // an artifact in the corridor
          const cr = corrLayer.rt, ts = now / 1000; cr.emit(sc.s.id.slice(5), "scanned", ts); cr.tick(ts); if (cr.changed.length) { cr.drain(); docMoved = true; syncArt(); }
          if (cr.pending) { window.clearTimeout(corrT.current); corrT.current = window.setTimeout(() => wakeRef.current(), Math.max(16, Math.min(60000, cr.nextDue() * 1000 - performance.now()))); }
        } else if (sc.s.what === "artifact" && rt && docSlug.current === W.slug && (!editRef.current || playRef.current)) { // scanning it can open doors, show things...
          const ts = now / 1000; rt.emit(sc.s.id, "scanned", ts); rt.tick(ts); if (rt.changed.length) { rt.drain(); docMoved = true; syncArt(); }
          if (rt.pending) { window.clearTimeout(docT.current); docT.current = window.setTimeout(() => wakeRef.current(), Math.max(16, Math.min(60000, rt.nextDue() * 1000 - performance.now()))); }
        }
      } else { const v = scanView.current; v.x = sc.s.x; v.y = sc.s.y; v.z = sc.s.z; v.p = p; scanTick = true; }
    }
    const animating = wantsDrone && a.playing && !document.hidden; // a playing drone breathes: repaint about 11 times a second, not 60
    const scrolling = (actorLayer.anim || actorLayer.screenSeen || (actorLayer.skyAnim && actorLayer.skySeen) || (actorLayer.flockAnim && actorLayer.flockSeen) || (corrAnim.current && !!linkRef.current)) && actorLayer.slug === W.slug || actorLayer.fade && !document.hidden; // flowing floors: about 15 a second
    const movers = (rtRef.current?.moving.size ?? 0) + (corrLayer.rt?.moving.size ?? 0) > 0 || moveAnim.current; // things that travel: repaint about 30 a second
    const tick = (animating && now - lastPaint.current >= 90) || (scrolling && now - lastPaint.current >= 66) || (movers && !document.hidden && now - lastPaint.current >= 33);
    if (tpRef.current) { r.eye = { ...r.eye, x: tpRef.current.x, z: tpRef.current.z, y: 0, vy: 0 }; r.moved = true; tpRef.current = null; }
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
      const bn = bossNear(rtRef.current, docSlug.current === W.slug, r.eye, editRef.current && !playRef.current), t = bn ? null : facing(W, r.eye); tgt.current = t;
      const label = bn ? (rtRef.current?.done.has(bn.id) ? `${bn.text || "The Unnamed Sound"} (echo): play its voice` : `Answer: ${bn.text || "The Unnamed Sound"}`) : t ? t.label : lock.current ? `Locked: ${lock.current.label}` : "";
      if (label !== shown.current) { shown.current = label; if (prompt.current) { prompt.current.textContent = label; prompt.current.style.opacity = label ? "1" : "0"; } }
      link.current?.sendPose(r.eye.x, r.eye.z, r.eye.yaw);
      if (now - dsAt.current > 100) { dsAt.current = now; st.dataset.x = r.eye.x.toFixed(2); st.dataset.z = r.eye.z.toFixed(2); st.dataset.yaw = r.eye.yaw.toFixed(3); st.dataset.pitch = r.eye.pitch.toFixed(3); st.dataset.y = (r.eye.y ?? 0).toFixed(2); st.dataset.target = label; st.dataset.lock = lock.current ? lock.current.id : ""; st.dataset.space = spaceRef.current; st.dataset.link = linkRef.current ? `${linkRef.current.next.slug}:${linkRef.current.open.toFixed(2)}` : ""; st.dataset.room = W.slug; st.dataset.ghosts = String(gpool.current.count); st.dataset.chat = String(W.chat?.length ?? 0); st.dataset.echo = echoBusy ? "1" : ""; st.dataset.scan = scanSt.current ? scanView.current.p.toFixed(2) : ""; }
      if (gov.current.minGap && now - lastPaint.current < gov.current.minGap) pendingPaint.current = true; // slow device: paint at ~30 fps
      else {
        pendingPaint.current = false; dirty.current = false;
        const w = size.current.w, h = size.current.h;
        if (w && h) {
          const ctx = c.getContext("2d");
          if (ctx) {
            actorLayer.now = now / 1000; actorLayer.budget = gov.current.scale >= 1 ? 260 : gov.current.scale >= 0.75 ? 120 : 0;
            const gap = now - lastPaint.current; lastPaint.current = now; const dv = dview.current; dv.playing = a.playing; dv.title = a.title; dv.t = now / 1000;
            const fv = fxv.current; fv.now = now; fv.echo = echoBusy ? ef : null; fv.scan = scanSt.current ? scanView.current : null;
            const L = linkRef.current, spo = sp.current; spo.link = L; spo.open = L ? L.open : 0; spo.corridor = !!L && spaceRef.current === "corridor";
            const t0 = performance.now(); const stt = paintRoom(ctx, w, h, W, r.eye, W.color ?? color, t, (() => { const gp = gpool.current; if (!others.current.size && !gp.count) return NO_ONE; const dl = drawList.current; dl.length = 0; for (const o of others.current.values()) dl.push(o); for (let i = 0; i < gp.count; i++) dl.push(gp.items[i]); return dl; })(), wantsDrone ? dv : null, lock.current, L ? spo : null, fv); const ms = (performance.now() - t0) * perfMul.current;
            if (!wantsDrone) dv.hit = null;
            // the time the paint took in JS is not all of it (a busy GPU or compositor shows up only as frames arriving late), so a continuous run of frames also counts by its spacing
            if (gov.current.observe(gap < 60 ? Math.max(ms, gap - 8) : ms, now) !== null) { fitRef.current(); dirty.current = true; }
            if (perfOn.current && perfEl.current && now - perfAt.current > 500) { perfAt.current = now; perfEl.current.textContent = `${gov.current.averageMs.toFixed(1)} ms avg · ${gov.current.p95().toFixed(1)} p95 · scale ${gov.current.scale} · ${stt.polys} polys`; }
          }
        }
        ++drawn.current; if (now - dsAt2.current > 100) { dsAt2.current = now; st.dataset.scale = String(gov.current.scale); const hh = dview.current.hit; st.dataset.drone = wantsDrone && hh ? `${Math.round(hh.x)},${Math.round(hh.y)}` : ""; st.dataset.drawn = String(drawn.current); }
      }
    }
    const more = !!(shotRef.current || movers || changed || animating || scrolling || actorLayer.fade || echoBusy || pendingPaint.current || dirty.current || (integ.current < 1 && !still) || (r.eye.y ?? 0) > 0 || (r.eye.vy ?? 0) !== 0 || (!still && hzOn && (hz.current.px || hz.current.pz)) || (!still && (k.size || stick.current.x || stick.current.y || drag.current)));
    if ((hudRef.current || scanModeRef.current) && !editRef.current) { // visor: its own small canvas, ~20 Hz while anything moves, once more when things settle
      const hc = hudC.current, sz = size.current;
      if (hc && sz.w && (now - hudAt.current > 48 || !more)) {
        hudAt.current = now; const hx = hc.getContext("2d");
        if (hx) {
          const cor = spaceRef.current === "corridor", list = cor ? corrScan.current : scanList.current, hn = hudN.current;
          if (hn.list !== list || now - hn.at > 1000) { hn.at = now; hn.list = list; if (hn.flags.length !== list.length) hn.flags = new Uint8Array(list.length); const dn = scannedIds(); let c2 = 0; for (let i = 0; i < list.length; i++) { const v = dn.has(scanId("lore", list[i].key)) ? 1 : 0; hn.flags[i] = v; c2 += v; } hn.done = c2; }
          let hi = hudIn.current; if (!hi) hi = hudIn.current = { x: 0, z: 0, yaw: 0, verts: W.verts, doors: W.doors, scan: list, scanned: hn.flags, others: others.current.values(), integ: 1, done: 0, total: 0, name: "", color: "", t: 0, locked: false, low: false, target: "", tdist: 0, on: 0, mode: "combat", targetScanned: false, scanP: 0, marks: hn.marks };
          const scanOn = scanModeRef.current, pe = r.eye;
          hi.x = pe.x; hi.z = pe.z; hi.yaw = pe.yaw; hi.verts = W.verts; hi.doors = W.doors; hi.scan = list; hi.scanned = hn.flags; hi.others = others.current.values(); hi.integ = integ.current; hi.done = hn.done; hi.total = list.length; hi.name = W.name; hi.color = W.color ?? color; hi.t = now / 1000; hi.on = hudOnAt.current; hi.low = gov.current.scale < 1;
          hi.mode = scanOn ? "scan" : "combat"; hi.locked = !scanOn && !!lock.current; hi.tdist = lock.current && !scanOn ? Math.hypot(lock.current.x - pe.x, lock.current.z - pe.z) : 0; hi.marks = hn.marks;
          if (scanOn) { // the scan visor: what is in view, outlined; the target is the one a scan runs on, else what the lock or the reticle is on
            const mk = hn.marks, f = focalOf(sz.w, sz.h), pb = scanProbe, cb = scanCam; mk.length = 0;
            for (let i = 0; i < list.length; i++) {
              const q = list[i]; pb[0] = q.x; pb[1] = q.y; pb[2] = q.z; toCam(pe, pb, cb);
              const dz = cb[2]; if (dz <= NEAR || dz > 40) continue;
              const px = sz.w / 2 + (cb[0] * f) / dz, py = sz.h / 2 - (cb[1] * f) / dz;
              if (px < -40 || py < -40 || px > sz.w + 40 || py > sz.h + 40) continue;
              const j = mk.length; let m = hn.pool[j]; if (!m) hn.pool[j] = m = { sx: 0, sy: 0, sz: 0, scanned: false };
              m.sx = px; m.sy = py; m.sz = Math.max(9, Math.min(110, (0.5 * f) / dz)); m.scanned = hn.flags[i] === 1; mk.push(m);
            }
            const sc = scanSt.current, tl = sc ? null : lock.current ?? pickLock(W, pe, NO_PEOPLE_ITER); let ti = -1;
            if (sc) ti = list.indexOf(sc.s); else if (tl && tl.kind !== "person") ti = list.findIndex((x) => x.id === tl.id && x.lockKind === tl.kind);
            hi.target = ti >= 0 ? list[ti].label : ""; hi.targetScanned = ti >= 0 && hn.flags[ti] === 1; hi.scanP = sc ? clamp((now - sc.t0) / SCAN_MS, 0, 1) : 0;
          } else { hi.target = lock.current ? lock.current.label : ""; hi.targetScanned = false; hi.scanP = 0; }
          drawHud(hx, sz.w, sz.h, hi);
        }
      }
    }
    if (more || gpool.current.active) raf.current = requestAnimationFrame(frame); else { last.current = 0; flushDs(); if (ghosts.current.length) { window.clearTimeout(ghostT.current); ghostT.current = window.setTimeout(() => wakeRef.current(), Math.min(30000, Math.max(250, gpool.current.nextStartMs)) + 40); } }
  }, [color, go, onLocked, showToast, flushDs, solve, openLink, ensureFx, openScan]);

  function wake() { if (!raf.current && alive.current) raf.current = requestAnimationFrame(frame); }
  const wakeRef = useRef(wake); wakeRef.current = wake;

  // size the canvas to the stage (device pixels capped: 1.5, or 1 on small CPUs)
  useEffect(() => {
    const st = stage.current, c = canvas.current; if (!st || !c) return;
    const fit = () => { // device pixels capped (1.5, or 1 on small CPUs), then scaled down by the governor when painting is slow
      const w = st.clientWidth, h = st.clientHeight; dprBase.current = Math.min(window.devicePixelRatio || 1, (navigator.hardwareConcurrency ?? 8) <= 4 ? 1 : 1.5);
      const dpr = dprBase.current * gov.current.scale;
      c.width = Math.max(1, Math.round(w * dpr)); c.height = Math.max(1, Math.round(h * dpr)); size.current = { w, h };
      c.getContext("2d")?.setTransform(dpr, 0, 0, dpr, 0, 0); { const hc = hudC.current; if (hc) { const hd = 1 /* the visor is line art: at 1x it has a quarter of the pixels of 2x on a retina screen */; hc.width = Math.max(1, Math.round(w * hd)); hc.height = Math.max(1, Math.round(h * hd)); hc.getContext("2d")?.setTransform(hd, 0, 0, hd, 0, 0); hudAt.current = 0; } } dirty.current = true; wakeRef.current();
    };
    fitRef.current = fit;
    fit(); const ro = new ResizeObserver(fit); ro.observe(st); return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (scanResRef.current) { // the scan screen is open: the room stands still and these keys answer it
        const onScanButton = (e.target as HTMLElement | null)?.closest?.(".scan-screen button, .scan-screen [role='button']");
        if (onScanButton && (e.code === "Space" || e.code === "Enter")) return; // a focused scan button takes its own keys
        if (e.code === "Space" || e.code === "Enter" || e.code === "KeyB" || e.code === "KeyX") { e.preventDefault(); e.stopPropagation(); if (!e.repeat) scanActRef.current(e.code === "KeyX" ? "exit" : e.code === "KeyB" || scanResRef.current?.view === "entry" ? "back" : "read"); }
        return;
      }
      if (e.code === "KeyB") { e.stopPropagation(); return; } // B is the scan screen's back key; here it must not jump to the Soundbay letter shortcut (Layout)
      if (pausedRef.current) return;
      if (e.code === "Space" || e.code === "Enter" || e.code === "KeyF") { if (e.code === "Enter" && (e.target as HTMLElement)?.closest?.("a,button")) return; e.preventDefault(); e.stopPropagation(); if (!e.repeat) { if (e.code !== "KeyF" && scanModeRef.current) startScanRef.current(); else use(); } return; }
      if (e.code === "KeyZ") { e.preventDefault(); e.stopPropagation(); if (!e.repeat) toggleLockRef.current(); return; }
      if (e.code === "KeyV") { e.preventDefault(); e.stopPropagation(); if (!e.repeat) doPingRef.current(); return; }
      if (e.code === "KeyX") { e.preventDefault(); e.stopPropagation(); if (!e.repeat) toggleScanRef.current(); return; }
      if (e.code === "KeyL") { e.preventDefault(); e.stopPropagation(); if (!e.repeat) logbookRef.current(); return; }
      if (e.code === "KeyC") { e.preventDefault(); e.stopPropagation(); if (!e.repeat) callDroneRef.current(); return; }
      if (e.code === "KeyH") { e.preventDefault(); e.stopPropagation(); if (!e.repeat) { const v = !hudRef.current; setHudOn(v); setHud(v); } return; }
      if (e.code === "KeyJ") { e.preventDefault(); e.stopPropagation(); if (!e.repeat) { jumpReq.current = true; wakeRef.current(); } return; }
      if (KEYS[e.code] || e.code === "ShiftLeft" || e.code === "ShiftRight") { e.preventDefault(); e.stopPropagation(); keys.current.add(e.code); wakeRef.current(); }
    };
    const up = (e: KeyboardEvent) => { keys.current.delete(e.code); };
    const blur = () => { keys.current.clear(); stick.current = { x: 0, y: 0 }; };
    window.addEventListener("keydown", down, true); window.addEventListener("keyup", up, true); window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", down, true); window.removeEventListener("keyup", up, true); window.removeEventListener("blur", blur); };
  }, [use]);
  // Unmount only (not when a handler is swapped): stop the frame and cancel every pending timer, so a late timer cannot restart the loop or keep this room alive.
  useEffect(() => { alive.current = true; return () => { alive.current = false; cancelAnimationFrame(raf.current); raf.current = 0; for (const t of [docT, corrT, ghostT, toastT]) window.clearTimeout(t.current); }; }, []);

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
  const doPingRef = useRef(doPing); doPingRef.current = doPing; const startScanRef = useRef(startScan); startScanRef.current = startScan; const scanActRef = useRef(scanAct); scanActRef.current = scanAct; const toggleScanRef = useRef(toggleScan); toggleScanRef.current = toggleScan;
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
      if (d.type === "mouse") { if (scanModeRef.current) startScanRef.current(); else use(); }
    }
  };

  const showVisor = (hud || scanMode) && !editing; // the scan visor always shows its overlay
  return (
    <div className={showVisor ? "rm hud-on" : "rm"} data-testid="branch-room" style={{ ["--rm" as string]: color }}>
      <div ref={stage} className="rm-stage" tabIndex={0} aria-label={`${world.name}: walk with W A S D or the arrow keys, Space to use`} data-testid="room-stage" data-room={world.slug}
        onContextMenu={(e) => e.preventDefault()} onPointerDown={pdown} onPointerMove={pmove} onPointerUp={pup} onPointerCancel={pup}>
        <canvas ref={canvas} />
      </div>
      <div className="rm-scan" aria-hidden="true" />
      {showVisor && <canvas ref={hudMount} className="rm-hud" data-testid="room-hud" aria-hidden="true" />}
      <div className="rm-title">{world.name}{here > 0 && <span data-testid="room-here" className="rm-here"> · {here} here</span>}</div>
      <div ref={prompt} className="rm-prompt" data-testid="room-prompt" aria-live="polite" />
      <div ref={toast} className="rm-toast" role="status" />
      {boss && <BossPanel key={boss.id} name={boss.text} seed={boss.img} diff={boss.mode} beaten={!!rtRef.current?.done.has(boss.id)} color={boss.color}
        onClose={() => { setBoss(null); stage.current?.focus({ preventScroll: true }); dirty.current = true; wakeRef.current(); }}
        onEngage={() => { const rt = rtRef.current; if (rt) { const ts = performance.now() / 1000; rt.emit(boss.id, "engaged", ts); rt.tick(ts); if (rt.changed.length) { rt.drain(); syncArt(); } dirty.current = true; wakeRef.current(); } }}
        onWin={() => { const rt = rtRef.current, W = wref.current; if (!rt) return; markBeaten(bossKey(W.slug, boss.id)); rt.done.add(boss.id); const ts = performance.now() / 1000; rt.emit(boss.id, "defeated", ts); rt.tick(ts); if (rt.changed.length) { rt.drain(); syncArt(); }
          const name = boss.text || "The Unnamed Sound"; addLog({ key: `room:${W.slug}/boss/${boss.id}`, room: W.slug, title: name, text: boss.lore || `${name} resolved. It answered, and its voice is yours.`, owner: !!boss.lore, at: Date.now() }); showToast("Logbook: " + name);
          if (rt.pending) { window.clearTimeout(docT.current); docT.current = window.setTimeout(() => wakeRef.current(), Math.max(16, Math.min(60000, rt.nextDue() * 1000 - performance.now()))); } dirty.current = true; wakeRef.current(); }} />}
      <div ref={hurtEl} className="rm-hurt" aria-hidden="true" />
      <div ref={integEl} className="rm-integ" data-testid="room-integrity" aria-hidden="true" style={{ opacity: 0 }}><i /></div>
      {scanRes && <ScanScreen res={scanRes} onRead={() => scanAct("read")} onBack={() => scanAct("back")} onExit={() => scanAct("exit")} />}
      {perfOn.current && <div ref={perfEl} className="rm-perf" data-testid="room-perf" />}
      <div className="rm-bar">
        <RoomTile to={backHref} icon="page" label="Classic view" testid="room-back" />
        <RoomTile to={mapHref} icon="map" label="Map" testid="room-map" />
        <RoomTile icon="note" label="Drone" keys="C" testid="room-drone" onClick={callDrone} />
        <RoomTile icon="ping" label="Ping" keys="V" disabled={!visor.on} testid="room-ping" onClick={doPing} />
        <RoomTile icon="scan" label={scanMode ? "Combat visor" : "Scan visor"} keys="X" pressed={scanMode} testid="room-scan" onClick={toggleScan} />
        <RoomTile icon="hud" label="Visor" keys="H" pressed={hud} testid="room-hud-toggle" onClick={() => { const v = !hud; setHudOn(v); setHud(v); }} />
        <RoomTile icon="book" label="Logbook" keys="L" testid="room-logbook" onClick={onLogbook} />
        {isAdmin && <RoomTile icon="pencil" label={corrW ? "Close corridor editor" : "Edit room"} pressed={editing} testid="room-edit" onClick={() => { if (editing) closeEditor(); else { setEditing(true); editRef.current = true; useDoc(doc, wref.current.slug, false); } }} />}
        {isAdmin && inCorr && !editing && <RoomTile icon="pencil" label="Edit corridor" testid="room-edit-corr" onClick={() => void editCorridor()} />}
        <RoomTile icon="lock" label={locked ? "Unlock" : "Lock on"} keys="Z" pressed={locked} testid="room-lock" onClick={toggleLock} />
        <RoomTile icon={visible ? "eye" : "eyeoff"} label={visible ? "Visible" : "Hidden"} pressed={visible} testid="room-visible" onClick={() => { const v = !visible; setVisible(v); setVis(v); }} />
      </div>
      {isAdmin && editing && <Suspense fallback={null}><RoomEditor themeNote={themeNote} hasTheme={ownTheme} themeMsg={themeMsg} onTheme={(k) => void (k === "save" ? saveTheme() : clearTheme())} world={corrW ? corrW.world : world} cx={corrW?.cx ?? 0} cz={corrW?.cz ?? 0} corridor={!!corrW} doc={doc} onDoc={changeDoc} onUndo={undoDoc} onRedo={redoDoc} canUndo={hist.current.undo.length > 0} canRedo={hist.current.redo.length > 0} sel={sel} setSel={(id) => { setSel(id); if (corrEdit.current) corrLayer.sel = id; else actorLayer.sel = id; dirty.current = true; wakeRef.current(); }} where={() => (corrEdit.current ? { x: eye.current.x - corrLayer.ox, z: eye.current.z - corrLayer.oz, yaw: eye.current.yaw } : eye.current)} dirty={!sameDoc} busy={busy} error={err} playing={playTest} onPlay={setPlay} onSave={saveDoc} onRevert={() => { setDoc(saved); useDoc(saved, wref.current.slug, false); }} onClose={closeEditor} /></Suspense>}
      <div className="rm-pad"><RoomStick onChange={onStick} /></div>
      {hasHeight && <button type="button" className="rm-jump" data-testid="room-jump" aria-label="Jump" onClick={() => { jumpReq.current = true; wakeRef.current(); }} onPointerDown={(e) => e.stopPropagation()}>Jump</button>}
      <button type="button" className="rm-use" data-testid="room-use" onClick={() => { if (scanMode) startScan(); else use(); }} onPointerDown={(e) => e.stopPropagation()}><Glyph name={scanMode ? "scan" : "door"} /><span>{scanMode ? "Scan" : "Use"}</span></button>
      <p key={scanMode ? "scan" : "walk"} className="rm-hint">{scanMode ? "W A S D move · Space scan · F use · X combat visor" : "W A S D move · Space use · X scan visor"}</p>
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
