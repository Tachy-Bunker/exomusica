import { useMemo } from "react";
import type { BlockType, Group, Rule } from "./types";

export const blockTokens = (body: string): string[] => [...new Set([...body.matchAll(/\{\{\s*block\s*:\s*([^{}|]+?)\s*\}\}/gi)].map((m) => m[1].trim()))];
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** For every {{block:Kind}} in the message: which block goes to whom. A default, plus a different one for people in a group (the festival bio for festivals, the release bio for labels). */
export function VariantsPanel({ body, types, groups, rules, onRules }: { body: string; types: BlockType[]; groups: Group[]; rules: Rule[]; onRules: (r: Rule[]) => void }) {
  const kinds = useMemo(() => blockTokens(body), [body]);
  if (kinds.length === 0) return null;
  const set = (kind: string, group: number | null, blockId: number | null) => {
    const rest = rules.filter((r) => !(same(r.kind, kind) && r.group === group));
    onRules(blockId === null ? rest : [...rest, { kind, group, blockId }]);
  };
  return (
    <div className="ox-variants" aria-label="Block variants">
      <h4>Which block goes to whom</h4>
      {kinds.map((kind) => {
        const t = types.find((x) => same(x.name, kind)), mine = rules.filter((r) => same(r.kind, kind));
        if (!t) return <p key={kind} className="ox-warn">There is no kind of block called “{kind}”. Make one in Blocks, or change the {`{{block:${kind}}}`} line.</p>;
        const def = mine.find((r) => r.group === null)?.blockId ?? t.blocks[0]?.id ?? "";
        const overs = mine.filter((r) => r.group !== null);
        const free = groups.filter((g) => !overs.some((o) => o.group === g.id));
        return (
          <div key={kind} className="ox-variant">
            <b>{t.name}</b>
            <label>everyone <select value={def} onChange={(e) => set(kind, null, Number(e.target.value))}>{t.blocks.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}</select></label>
            {overs.map((o) => (
              <label key={o.group}>{groups.find((g) => g.id === o.group)?.name ?? "group"}
                <select value={o.blockId} onChange={(e) => set(kind, o.group, Number(e.target.value))}>{t.blocks.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}</select>
                <button className="btn-link" onClick={() => set(kind, o.group, null)} aria-label="Remove this exception">✕</button></label>
            ))}
            {free.length > 0 && t.blocks.length > 1 && <select aria-label={`Different ${t.name} for a group`} value="" onChange={(e) => { if (e.target.value) set(kind, Number(e.target.value), t.blocks.find((b) => b.id !== def)?.id ?? t.blocks[0].id); }}><option value="">+ different one for a group…</option>{free.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>}
            {t.blocks.length === 0 && <span className="ox-warn">No block of this kind yet.</span>}
          </div>
        );
      })}
    </div>
  );
}
