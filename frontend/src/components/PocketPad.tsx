import { useEffect } from "react";
import { create } from "zustand";
import { usePocketStore } from "../lib/pocketStore";
import { LINK_MIME } from "../lib/chatInsert";
import { dragText, entityFromDrop, entityOfHref, type Dragged } from "../lib/dropEntity";

interface DragState { active: Dragged | null; flash: string | null; set: (p: Partial<Pick<DragState, "active" | "flash">>) => void }
export const useDragStore = create<DragState>((set) => ({ active: null, flash: null, set: (p) => set(p) }));

export const carries = (e: { dataTransfer: DataTransfer | null }): boolean => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes(LINK_MIME);

/** Drop handler shared by the pad and the faceplate's Pocket button. */
export function dropToPocket(e: React.DragEvent): void {
  if (!carries(e)) return;
  e.preventDefault();
  const d = entityFromDrop(e.dataTransfer.getData(LINK_MIME), window.location.origin);
  useDragStore.getState().set({ active: null });
  if (!d) return;
  usePocketStore.getState().add(d);
  useDragStore.getState().set({ flash: d.title });
  window.setTimeout(() => useDragStore.getState().set({ flash: null }), 1500);
}
export const allowDrop = (e: React.DragEvent): void => { if (carries(e)) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } };

/** While a thing is being dragged, a pad appears that says where it can go: the pocket. Any link to a thing on the site (a branch row, a plate, a link in a message)
 *  is carried; other pages (messages, account, admin) are not things, so the pad does not show for them. Mouse and pen only: a finger cannot drag. */
export function PocketPad() {
  const active = useDragStore((s) => s.active);
  const flash = useDragStore((s) => s.flash);
  useEffect(() => {
    const origin = window.location.origin;
    function start(e: DragEvent) {
      const dt = e.dataTransfer; if (!dt) return;
      let text = dt.getData(LINK_MIME);
      if (!text) { // a plain link on the page: give it a title and our format so every drop target understands it
        const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
        if (a && entityOfHref(a.href, origin)) {
          const title = (a.getAttribute("aria-label") || a.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80);
          text = dragText(title || "link", a.href);
          dt.setData(LINK_MIME, text); dt.setData("text/plain", text); dt.effectAllowed = "copyLink";
        }
      }
      const d = text ? entityFromDrop(text, origin) : null;
      if (d) useDragStore.getState().set({ active: d });
    }
    const end = () => useDragStore.getState().set({ active: null });
    const endSoon = () => { window.setTimeout(end, 0); }; // after the pad's own drop handler has run: removing the pad first would lose the drop
    window.addEventListener("dragstart", start); window.addEventListener("dragend", endSoon); window.addEventListener("drop", endSoon, true);
    return () => { window.removeEventListener("dragstart", start); window.removeEventListener("dragend", endSoon); window.removeEventListener("drop", endSoon, true); };
  }, []);
  if (!active && !flash) return null;
  return (
    <div className={`pocket-pad${flash ? " done" : ""}`} onDragOver={allowDrop} onDrop={dropToPocket} role="status" aria-live="polite" data-testid="pocket-pad">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true"><path d="M5 4h14v9a7 7 0 0 1-14 0z M5 9h14" /></svg>
      <span>{flash ? <>✓ <b>{flash}</b> is in your pocket</> : <>Drop <b>{active!.title}</b> here to put it in your pocket</>}</span>
    </div>
  );
}
