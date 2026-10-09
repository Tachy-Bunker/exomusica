import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { focusOf, hrefOf, keyOf, peekOf, type Entity, type Peek } from "../lib/atlas";
import { sectionOf } from "../lib/navSections";
import { noteFocus } from "../lib/trace";
import { useTrailStore } from "../lib/trailStore";
import { usePocketStore } from "../lib/pocketStore";
import { useAround, type ChatRef } from "../lib/useAtlas";
import { useChatDockStore } from "../lib/chatDockStore";
import { useIsDesktop } from "../lib/useIsDesktop";
import { setArrival } from "../lib/arrive";
import { chatLinkText, hasComposer, insertIntoChat } from "../lib/chatInsert";
import { operator } from "../lib/operator";
import { Faceplate } from "./Faceplate";
import { Plate } from "./Plate";
import { Terminal } from "./Terminal";
import { Landmarks } from "./Landmarks";
import { PocketPad } from "./PocketPad";

const SECTION_NAME: Record<string, string> = { soundbay: "Soundbay", xenolab: "XenoLab", telemetry: "Telemetry", log: "Log" };

/** Pocket button inside any plate: put this thing in your pocket. */
function Take({ e }: { e: Pick<Entity, "type" | "id" | "title"> }) {
  const add = usePocketStore((s) => s.add);
  const has = usePocketStore((s) => s.items.some((x) => x.key === keyOf(e.type, e.id)));
  return <button type="button" className="plate-take" onClick={() => add(e)} aria-label={has ? `${e.title} is in your pocket` : `Put ${e.title} in your pocket`} aria-pressed={has} title={has ? "In your pocket" : "Pick up"} data-testid="plate-take">{has ? "✓" : "+"}</button>;
}

function Panel({ label, onClose, children, testid }: { label: string; onClose: () => void; children: React.ReactNode; testid: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDown(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as HTMLElement).closest(".faceplate")) onClose(); }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [onClose]);
  // On a phone this is a sheet from the bottom: a dimmed backdrop (tap it to close) and a close button that is always visible.
  return (
    <>
      <div className="fp-backdrop" onClick={onClose} aria-hidden="true" data-testid="fp-backdrop" />
      <div className="fp-panel" ref={ref} role="dialog" aria-label={label} data-testid={testid}>
        <div className="fp-panel-head"><b>{label}</b><button type="button" className="fp-panel-x" onClick={onClose} aria-label={`Close ${label}`} data-testid="fp-panel-close">Close ×</button></div>
        {children}
      </div>
    </>
  );
}

/** "You were here" and "nearby", in the middle of the faceplate on wide screens; they drop down on hover, over everything, and never sit over a page's own columns. */
function Relations({ there, neighbors }: { there: { type: Entity["type"]; id: string; title: string }[]; neighbors: Peek[] }) {
  const groups = [
    { id: "there", label: "You were here", n: there.length, body: there.map((t) => <Plate key={`${t.type}:${t.id}`} peek={peekOf({ type: t.type, id: t.id, title: t.title })} edge="left"><Take e={t} /></Plate>) },
    { id: "near", label: "Nearby", n: neighbors.length, body: neighbors.map((n) => <Plate key={n.key} peek={n} edge="right"><Take e={n} /></Plate>) },
  ].filter((g) => g.n > 0);
  if (!groups.length) return null;
  return (
    <div className="fp-rels" data-testid="fp-rels">
      {groups.map((g) => (
        <div key={g.id} className="fp-rel" data-testid={`fp-rel-${g.id}`}>
          <button type="button" className="fp-btn fp-rel-btn" aria-haspopup="true">{g.label}<em>{g.n}</em></button>
          <div className="fp-rel-drop" role="group" aria-label={g.label}>{g.body}</div>
        </div>
      ))}
    </div>
  );
}

/** The persistent frame around every page: the faceplate, the margins (what is just outside this page), the pocket, and the terminal. */
export function AtlasShell() {
  const loc = useLocation();
  const focus = useMemo(() => focusOf(loc.pathname, loc.search), [loc.pathname, loc.search]);
  const focusKey = focus ? keyOf(focus.type, focus.id) : null;
  const { around } = useAround(focus);
  const trail = useTrailStore((s) => s.trail);
  const visit = useTrailStore((s) => s.visit);
  const pocket = usePocketStore();
  const openChat = useChatDockStore((s) => s.openChat);
  const [sheet, setSheet] = useState(false);
  const section = sectionOf(loc.pathname);
  const isDesktop = useIsDesktop();

  useEffect(() => { noteFocus(focusKey); }, [focusKey]);
  useEffect(() => {
    if (focus && around?.title) visit({ type: focus.type, id: focus.id, title: around.title, href: hrefOf(focus.type, focus.id), image: null });
  }, [focusKey, around?.title]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setSheet(false); pocket.setOpen(false); }, [loc.pathname, loc.search]); // eslint-disable-line react-hooks/exhaustive-deps

  const there = trail.filter((t) => !(focus && t.type === focus.type && t.id === focus.id));
  const neighbors = around?.neighbors ?? [];
  const chat: ChatRef | undefined = around?.conversation[0];
  const aroundCount = (around?.context.length ?? 0) + neighbors.length + (chat ? 1 : 0) + there.length;
  const focusEntity: Entity | null = focus ? { ...focus, title: around?.title ?? focus.id } : null;
  const startChat = (c: ChatRef) => openChat(c.slug, c.name, c.branchSlug ?? undefined);

  return (
    <>
      <Faceplate focus={focus} section={section ? SECTION_NAME[section] : null} around={around} aroundCount={aroundCount} onAround={() => { setSheet((s) => !s); pocket.setOpen(false); }} center={isDesktop ? <Relations there={there.slice(0, 6)} neighbors={neighbors.slice(0, 8)} /> : undefined} />

      {/* Wide screens: "you were here" and "nearby" sit in the middle of the faceplate (hover to drop them down); the conversation is the button at the bottom. */}
      {chat && (
        <button type="button" className="margin-chat" onClick={() => startChat(chat)} data-testid="margin-chat" aria-label={`Open the conversation: ${chat.name}`}>
          <span aria-hidden="true">💬</span> {chat.name}
        </button>
      )}

      {sheet && (
        <Panel label="Around here" onClose={() => setSheet(false)} testid="around-sheet">
          {around && around.context.length > 0 && <><h3>Belongs to</h3>{around.context.map((c) => <Plate key={c.key} peek={c} edge="top"><Take e={c} /></Plate>)}</>}
          {chat && <><h3>Conversation</h3><button type="button" className="btn" onClick={() => { startChat(chat); setSheet(false); }}>💬 {chat.name}</button></>}
          {neighbors.length > 0 && <><h3>Nearby</h3>{neighbors.map((n) => <Plate key={n.key} peek={n} edge="right"><Take e={n} /></Plate>)}</>}
          {there.length > 0 && <><h3>You were here</h3>{there.map((t) => <Plate key={`${t.type}:${t.id}`} peek={peekOf({ type: t.type, id: t.id, title: t.title })} edge="left"><Take e={t} /></Plate>)}</>}
          {aroundCount === 0 && <p className="dim">{operator.quiet}</p>}
        </Panel>
      )}
      {pocket.open && (
        <Panel label="Pocket" onClose={() => pocket.setOpen(false)} testid="pocket-tray">
          {pocket.items.length === 0 ? <p className="dim">{operator.pocketEmpty}</p> : pocket.items.map((p) => (
            <Plate key={p.key} peek={peekOf({ type: p.type, id: p.id, title: p.title })} edge="top" onPick={() => { setArrival("top"); pocket.setOpen(false); }}>
              {hasComposer() && <button type="button" className="plate-take plate-send" onClick={() => insertIntoChat(chatLinkText(p.title, hrefOf(p.type, p.id)))} aria-label={`Paste ${p.title} into the chat`} title="Paste into the chat" data-testid="pocket-send">↵</button>}
              <button type="button" className="plate-take" onClick={() => pocket.remove(p.key)} aria-label={`Take ${p.title} out of your pocket`} title="Drop" data-testid="pocket-drop">×</button>
            </Plate>
          ))}
          {focusEntity && !pocket.items.some((p) => p.key === keyOf(focusEntity.type, focusEntity.id)) && (
            <button type="button" className="btn" onClick={() => pocket.add(focusEntity)} data-testid="pocket-take-here">Pick up this page</button>
          )}
          {pocket.items.length > 0 && <button type="button" className="btn" onClick={pocket.clear}>Empty pocket</button>}
          <p className="dim fp-hint">Drag an item into a chat, or press ↵ beside it, to share its link.</p>
        </Panel>
      )}
      <Landmarks focusKey={focusKey} />
      <PocketPad />
      <Terminal focus={focusEntity} />
    </>
  );
}
