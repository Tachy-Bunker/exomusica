import { useChatDockStore } from "../lib/chatDockStore";
import { freqOf, showFreq } from "../lib/atlas";
import { heat, SLOTS, slotOf, type Room } from "../lib/rooms";
import { LINK_MIME } from "../lib/chatInsert";
import { roomFromDrop } from "../lib/roomDrop";
import { usePulseStore } from "../lib/dialPulse";

export const freqOfRoom = (r: { slug: string; branchSlug?: string }): string => showFreq(r.branchSlug ? freqOf("branch", r.branchSlug) : freqOf("topic", r.slug));
const droppable = (e: React.DragEvent): boolean => Array.from(e.dataTransfer.types).includes(LINK_MIME);

/** The lamp under a room: how busy the last half hour was (0..3 bars). */
export function Lamp({ slug }: { slug: string }) {
  const p = usePulseStore((s) => s.by[slug]);
  return <i className={`dial-lamp h${heat(p?.recent ?? 0)}`} aria-hidden="true" data-heat={heat(p?.recent ?? 0)} />;
}
export function Ping({ slug, current }: { slug: string; current?: boolean }) {
  const n = usePulseStore((s) => s.by[slug]?.mentions ?? 0);
  return n > 0 && !current ? <i className="dial-ping" role="img" aria-label={`${n} mention${n > 1 ? "s" : ""}`} data-testid="dial-ping" /> : null;
}

/** The dial under the dock's title: ‹ frequency ›, six pinned rooms with a lamp each, and a button for the full switcher (also the Q key). */
export function DialRail() {
  const slug = useChatDockStore((s) => s.openChannelSlug);
  const name = useChatDockStore((s) => s.openChannelName);
  const branch = useChatDockStore((s) => s.openBranchSlug);
  const presets = useChatDockStore((s) => s.presets);
  const recents = useChatDockStore((s) => s.recents);
  const { openSlot, pinRoom, unpinRoom, sleepSlot, tuneRoom, openChat, setSwitcher } = useChatDockStore.getState();
  if (!slug) return null;
  const here: Room = { slug, name: name ?? slug, branchSlug: branch ?? undefined };
  const lately = recents.filter((r) => r.slug !== slug && slotOf(presets, r) === -1).slice(0, 3);
  const dropOn = (i: number | null) => async (e: React.DragEvent) => {
    if (!droppable(e)) return; e.preventDefault();
    const r = await roomFromDrop(e.dataTransfer.getData(LINK_MIME)); if (!r) return;
    if (i === null) openChat(r.slug, r.name, r.branchSlug); else pinRoom(i, r);
  };
  const over = (e: React.DragEvent) => { if (droppable(e)) e.preventDefault(); };
  return (
    <div className="dial" data-testid="dial" role="toolbar" aria-label="Rooms">
      <button type="button" className="dial-step" onClick={() => tuneRoom(-1)} aria-label="Previous room (Alt+[)" title="Previous room (Alt+[)" data-testid="dial-prev">‹</button>
      <span className="dial-freq" data-testid="dial-freq" title="The frequency of this room. Drop a branch or topic here to tune to it." onDragOver={over} onDrop={dropOn(null)}>{freqOfRoom(here)}</span>
      <button type="button" className="dial-step" onClick={() => tuneRoom(1)} aria-label="Next room (Alt+])" title="Next room (Alt+])" data-testid="dial-next">›</button>
      <span className="dial-slots">
        {Array.from({ length: SLOTS }, (_, i) => {
          const r = presets[i];
          return r ? (
            <span key={i} className={`dial-slot${r.slug === slug ? " on" : ""}${r.asleep ? " asleep" : ""}`} onDragOver={over} onDrop={dropOn(i)}>
              <button type="button" onClick={() => openSlot(i)} title={`${r.name} (Alt+${i + 1})`} aria-pressed={r.slug === slug} data-testid="dial-slot"><i>{i + 1}</i>{r.name}<Ping slug={r.slug} current={r.slug === slug} /></button>
              <button type="button" className="dial-x dial-z" onClick={() => sleepSlot(i)} aria-pressed={!!r.asleep} aria-label={r.asleep ? `Wake ${r.name}` : `Put ${r.name} to sleep`} title={r.asleep ? "Wake: the dial stops skipping it" : "Sleep: the dial steps over it"} data-testid="dial-sleep">z</button>
              <button type="button" className="dial-x" onClick={() => unpinRoom(i)} aria-label={`Unpin ${r.name}`} title="Unpin">×</button>
              <Lamp slug={r.slug} />
            </span>
          ) : (
            <button key={i} type="button" className="dial-slot empty" onClick={() => pinRoom(i)} onDragOver={over} onDrop={dropOn(i)} title={`Pin ${here.name} here (Alt+Shift+${i + 1}), or drop a branch or topic`} aria-label={`Pin this room to slot ${i + 1}`} data-testid="dial-empty"><i>{i + 1}</i>+</button>
          );
        })}
      </span>
      {lately.length > 0 && (
        <span className="dial-recent" aria-label="Recent rooms">
          {lately.map((r) => <button key={r.slug} type="button" onClick={() => openChat(r.slug, r.name, r.branchSlug)} data-testid="dial-recent" title="Recent room">{r.name}<Ping slug={r.slug} /></button>)}
        </span>
      )}
      <button type="button" className="dial-rooms" onClick={() => setSwitcher(true)} title="All rooms and scenes (Q, or Alt+Q while typing)" data-testid="dial-rooms">Rooms <kbd>Q</kbd></button>
    </div>
  );
}
