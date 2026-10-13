/** A small "save point" under an editor: says where the draft is kept and when it was last kept, so long writing never feels at risk. */
export function SaveStation({ at, dirty }: { at: number | null; dirty: boolean }) {
  const t = at ? new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;
  return (
    <p className="save-station home-dim" data-testid="save-station" role="status">
      <i className={dirty && !t ? "" : "on"} aria-hidden="true" /> {t ? `Save point · draft kept on this device at ${t}` : dirty ? "Keeping a draft on this device…" : "Nothing unsaved"}
    </p>
  );
}
