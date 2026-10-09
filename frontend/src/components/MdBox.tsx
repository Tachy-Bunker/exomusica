import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { applyMd, type MdKind } from "../lib/mdEdit";
import { renderMessageContent } from "../lib/formatMessage";
import { CHAT_INSERT, spliceAt } from "../lib/chatInsert";
import { entityHits, entityMarkdown, entityTrigger, type EntityTrigger } from "../lib/chatEntities";
import { useIndex } from "../lib/useAtlas";
import type { Entity } from "../lib/atlas";
import { EntityPicker } from "./EntityPicker";

const TOOLS: { k: MdKind; label: string; title: string; cls?: string }[] = [
  { k: "bold", label: "B", title: "Bold (Ctrl+B)", cls: "b" }, { k: "italic", label: "I", title: "Italic (Ctrl+I)", cls: "i" }, { k: "strike", label: "S", title: "Strikethrough", cls: "s" },
  { k: "code", label: "<>", title: "Inline code" }, { k: "codeblock", label: "{ }", title: "Code block" }, { k: "spoiler", label: "▒", title: "Spoiler" },
  { k: "ul", label: "•", title: "Bullet list" }, { k: "ol", label: "1.", title: "Numbered list" }, { k: "quote", label: "❝", title: "Quote" }, { k: "head", label: "H", title: "Heading" },
  { k: "link", label: "🔗", title: "Link (Ctrl+K)" }, { k: "hr", label: "—", title: "Divider" },
];

/** The writing box of the Post page: a markdown toolbar, live preview, `#name` / `~7.156` linking, and the pocket's send button. Enter sends, Shift+Enter breaks the line. */
export function MdBox({ value, onChange, onSubmit, placeholder, children }: { value: string; onChange: (v: string) => void; onSubmit: () => void; placeholder?: string; children?: React.ReactNode }) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const nav = useNavigate();
  const [preview, setPreview] = useState(false);
  const [trig, setTrig] = useState<EntityTrigger | null>(null);
  const [sel, setSel] = useState(0);
  const index = useIndex(trig !== null);
  const hits = trig ? entityHits(index, trig) : [];

  const putRef = useRef<(t: string) => void>(() => {});
  putRef.current = (text: string) => {
    const el = ta.current; const at = el?.selectionStart ?? value.length, to = el?.selectionEnd ?? at;
    const r = spliceAt(value, at, to, text); onChange(r.value);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(r.cursor, r.cursor); });
  };
  useEffect(() => {
    const on = (ev: Event) => { const d = (ev as CustomEvent<{ text: string; handled: boolean }>).detail; if (d.handled || !ta.current || ta.current.offsetParent === null) return; d.handled = true; putRef.current(d.text); };
    window.addEventListener(CHAT_INSERT, on); return () => window.removeEventListener(CHAT_INSERT, on);
  }, []);

  function tool(k: MdKind) {
    const el = ta.current; if (!el) return;
    const r = applyMd(value, el.selectionStart, el.selectionEnd, k); onChange(r.value);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(r.start, r.end); });
  }
  function pick(e: Entity) {
    const el = ta.current; if (!el || !trig) return;
    const r = spliceAt(value, trig.start, el.selectionStart ?? value.length, entityMarkdown(e)); onChange(r.value); setTrig(null);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(r.cursor, r.cursor); });
  }
  function key(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (hits.length) {
      if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => (s + 1) % hits.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => (s - 1 + hits.length) % hits.length); return; }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) { e.preventDefault(); pick(hits[Math.min(sel, hits.length - 1)]); return; }
      if (e.key === "Escape") { e.preventDefault(); setTrig(null); return; }
    }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
      const k = e.key.toLowerCase(); const m: Record<string, MdKind> = { b: "bold", i: "italic", k: "link" };
      if (m[k]) { e.preventDefault(); tool(m[k]); return; }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); onSubmit(); }
  }
  return (
    <div className="mdbox" data-testid="mdbox">
      <div className="mdbox-bar" role="toolbar" aria-label="Formatting">
        {TOOLS.map((t) => <button key={t.k} type="button" className={`mdbox-btn${t.cls ? ` ${t.cls}` : ""}`} title={t.title} aria-label={t.title} data-testid={`md-${t.k}`} onClick={() => tool(t.k)} disabled={preview}>{t.label}</button>)}
        <button type="button" className="mdbox-btn mdbox-prev" aria-pressed={preview} onClick={() => setPreview((p) => !p)} data-testid="md-preview">{preview ? "Edit" : "Preview"}</button>
      </div>
      {preview
        ? <div className="mdbox-view" data-testid="md-view">{value.trim() ? renderMessageContent(value, nav) : <span className="home-dim">Nothing to preview yet.</span>}</div>
        : <>
            {hits.length > 0 && <EntityPicker hits={hits} sel={sel} onPick={pick} onHover={setSel} />}
            <textarea ref={ta} className="mdbox-text" data-composer="1" value={value} rows={3} placeholder={placeholder} aria-label="Write here"
              onChange={(e) => { onChange(e.target.value); setTrig(entityTrigger(e.target.value, e.target.selectionStart ?? e.target.value.length)); setSel(0); }} onKeyDown={key} />
          </>}
      {children}
    </div>
  );
}
