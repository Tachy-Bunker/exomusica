import { useDeferredValue, useEffect, useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { renderInlineMarkdown, renderMarkdown } from "../lib/markdown";
import { insertMarker, snapDroppedMarker, sourceOffsetForPreviewWord, wordAtPoint } from "../lib/footnotes";
import { useToastStore } from "../lib/toastStore";

const NOTE_MIME = "application/x-exo-note";
const HIGHLIGHT_NAME = "exo-drop-word";

// The CSS Custom Highlight API paints a range of text without touching the
// DOM - exactly what "light up the word under the dragged note" needs.
// Where it's unsupported the drop still works, just without the hover glow.
function setHighlight(range: Range | null) {
  const registry = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
  const HighlightCtor = (window as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
  if (!registry || !HighlightCtor) return;
  if (range) registry.set(HIGHLIGHT_NAME, new HighlightCtor(range));
  else registry.delete(HIGHLIGHT_NAME);
}

function isNoteDrag(e: DragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes(NOTE_MIME);
}

function commonPrefixLength(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

type Format = "bold" | "italic" | "code" | "codeblock" | "link" | "h2" | "h3" | "ul" | "ol" | "quote";

interface Props {
  body: string;
  onBodyChange: (next: string) => void;
  notes: { id: number; text: string }[];
  onAddNote: (text: string) => Promise<void>;
  onNavigate: (path: string) => void;
}

export function StudyEditor({ body, onBodyChange, notes, onAddNote, onNavigate }: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const deferredBody = useDeferredValue(body); // keeps typing snappy on slow devices; the preview catches up
  const [armed, setArmed] = useState<number | null>(null);
  const [newNote, setNewNote] = useState("");
  const pendingDrop = useRef<{ marker: string; before: string } | null>(null);
  const noteTexts = notes.map((n) => n.text);

  useEffect(() => () => setHighlight(null), []);
  useEffect(() => {
    if (armed === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setArmed(null);
        setHighlight(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [armed]);

  function toast(message: string) {
    useToastStore.getState().showToast(message);
  }

  // ------------------------------------------------ placing a note on a word
  function placeNote(n: number, x: number, y: number): boolean {
    const root = previewRef.current;
    if (!root) return false;
    if (deferredBody !== body) {
      toast("The preview is still updating - try again in a moment");
      return false;
    }
    const hit = wordAtPoint(root, x, y);
    if (!hit) {
      toast("Drop it right on a word");
      return false;
    }
    const offset = sourceOffsetForPreviewWord(root, body, hit.token);
    if (offset === null) {
      toast("Couldn't match that word back to the text - try dropping it in the writing box instead");
      return false;
    }
    onBodyChange(insertMarker(body, offset, n));
    return true;
  }

  function updateHover(x: number, y: number) {
    const root = previewRef.current;
    setHighlight(root ? (wordAtPoint(root, x, y)?.range ?? null) : null);
  }

  // ------------------------------------------------------------ textarea
  function handleTextareaChange(e: ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    const pending = pendingDrop.current;
    pendingDrop.current = null;
    if (pending) {
      // A note was just dropped here natively, at whatever caret position
      // was under the pointer - nudge it to the end of that word.
      const snapped = snapDroppedMarker(pending.before, next, pending.marker);
      if (snapped !== null && snapped !== next) {
        const ta = taRef.current;
        const scrollTop = ta?.scrollTop ?? 0;
        const caret = commonPrefixLength(pending.before, snapped) + pending.marker.length;
        onBodyChange(snapped);
        requestAnimationFrame(() => {
          if (!ta) return;
          ta.scrollTop = scrollTop;
          ta.setSelectionRange(caret, caret);
        });
        return;
      }
    }
    onBodyChange(next);
  }

  // ------------------------------------------------------------- toolbar
  function applyFormat(format: Format) {
    const ta = taRef.current;
    if (!ta) return;
    const v = body;
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const selected = v.slice(s, e);
    let next = v;
    let selStart = s;
    let selEnd = e;

    const wrap = (pre: string, post: string, placeholder: string) => {
      const inner = selected || placeholder;
      next = v.slice(0, s) + pre + inner + post + v.slice(e);
      selStart = s + pre.length;
      selEnd = selStart + inner.length;
    };
    const mapLines = (fn: (line: string, i: number) => string) => {
      const ls = s === 0 ? 0 : v.lastIndexOf("\n", s - 1) + 1;
      const nl = v.indexOf("\n", e);
      const le = nl === -1 ? v.length : nl;
      const out = v.slice(ls, le).split("\n").map(fn).join("\n");
      next = v.slice(0, ls) + out + v.slice(le);
      selStart = ls;
      selEnd = ls + out.length;
    };
    const togglePrefix = (prefix: string, stripExisting?: RegExp) => (line: string, _i: number, all: string[]) => {
      void _i;
      void all;
      return line.startsWith(prefix) ? line.slice(prefix.length) : prefix + (stripExisting ? line.replace(stripExisting, "") : line);
    };

    switch (format) {
      case "bold":
        wrap("**", "**", "bold text");
        break;
      case "italic":
        wrap("*", "*", "italic text");
        break;
      case "code":
        wrap("`", "`", "code");
        break;
      case "codeblock":
        wrap("```\n", "\n```", "code");
        break;
      case "link": {
        const text = selected || "link text";
        const url = "https://";
        next = v.slice(0, s) + `[${text}](${url})` + v.slice(e);
        selStart = s + text.length + 3;
        selEnd = selStart + url.length;
        break;
      }
      case "h2":
        mapLines((l) => (l.startsWith("## ") ? l.slice(3) : "## " + l.replace(/^#{1,3}\s/, "")));
        break;
      case "h3":
        mapLines((l) => (l.startsWith("### ") ? l.slice(4) : "### " + l.replace(/^#{1,3}\s/, "")));
        break;
      case "ul":
        mapLines((l) => togglePrefix("- ")(l, 0, []));
        break;
      case "quote":
        mapLines((l) => togglePrefix("> ")(l, 0, []));
        break;
      case "ol":
        mapLines((l, i) => (/^\d+[.)]\s/.test(l) ? l.replace(/^\d+[.)]\s/, "") : `${i + 1}. ${l}`));
        break;
    }
    const scrollTop = ta.scrollTop;
    onBodyChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.scrollTop = scrollTop;
      ta.setSelectionRange(selStart, selEnd);
    });
  }

  function handleTextareaKeyDown(e: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const map: Record<string, Format> = { b: "bold", i: "italic", k: "link" };
    const format = map[e.key.toLowerCase()];
    if (format) {
      e.preventDefault();
      applyFormat(format);
    }
  }

  async function submitNote() {
    const text = newNote.trim();
    if (!text) return;
    await onAddNote(text);
    setNewNote("");
  }

  const tools: { format: Format; label: React.ReactNode; title: string }[] = [
    { format: "bold", label: <b>B</b>, title: "Bold (Ctrl+B)" },
    { format: "italic", label: <i>I</i>, title: "Italic (Ctrl+I)" },
    { format: "h2", label: "H2", title: "Heading" },
    { format: "h3", label: "H3", title: "Subheading" },
    { format: "link", label: "🔗", title: "Link (Ctrl+K)" },
    { format: "ul", label: "•", title: "Bullet list" },
    { format: "ol", label: "1.", title: "Numbered list" },
    { format: "quote", label: "❝", title: "Quote" },
    { format: "code", label: "<>", title: "Inline code" },
    { format: "codeblock", label: "{ }", title: "Code block" },
  ];

  return (
    <div className="study-editor">
      <div className="study-notes-tray">
        <span className="study-tray-label">Notes</span>
        {notes.length === 0 && <span className="study-tray-empty">Add a note, then drag its [n] onto a word in the preview.</span>}
        {notes.map((n, i) => (
          <span
            key={n.id}
            role="button"
            tabIndex={0}
            draggable
            className={`note-chip${armed === i + 1 ? " armed" : ""}`}
            title={`${n.text}\n\nDrag onto a word, or click then click a word`}
            onDragStart={(e) => {
              e.dataTransfer.setData(NOTE_MIME, String(i + 1));
              e.dataTransfer.setData("text/plain", `[${i + 1}]`);
              e.dataTransfer.effectAllowed = "copy";
              setArmed(null);
            }}
            onDragEnd={() => setHighlight(null)}
            onClick={() => {
              setArmed((cur) => (cur === i + 1 ? null : i + 1));
              setHighlight(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setArmed((cur) => (cur === i + 1 ? null : i + 1));
              }
            }}
          >
            <b>[{i + 1}]</b> {n.text.length > 28 ? n.text.slice(0, 28) + "…" : n.text}
          </span>
        ))}
        <span className="note-add">
          <input
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submitNote();
              }
            }}
            placeholder={`New note [${notes.length + 1}] - links like [Smith 2020](https://…) work`}
          />
          <button type="button" className="btn btn-primary" onClick={() => void submitNote()}>
            Add
          </button>
        </span>
        {newNote.trim() && <div className="note-add-preview">{renderInlineMarkdown(newNote)}</div>}
      </div>

      {armed !== null && (
        <div className="study-armed-hint">
          Click a word in the preview to place <b>[{armed}]</b>{" "}
          <button type="button" className="btn" onClick={() => setArmed(null)}>
            Cancel
          </button>
        </div>
      )}

      <div className="study-editor-panes">
        <div className="study-editor-pane">
          <div className="study-pane-head">
            <span>Write</span>
            <span className="study-toolbar">
              {tools.map((t) => (
                <button key={t.format} type="button" className="btn" title={t.title} onMouseDown={(e) => e.preventDefault()} onClick={() => applyFormat(t.format)}>
                  {t.label}
                </button>
              ))}
            </span>
          </div>
          <textarea
            ref={taRef}
            value={body}
            onChange={handleTextareaChange}
            onKeyDown={handleTextareaKeyDown}
            onDrop={(e) => {
              if (!isNoteDrag(e)) return;
              pendingDrop.current = { marker: `[${e.dataTransfer.getData(NOTE_MIME)}]`, before: body };
              setTimeout(() => (pendingDrop.current = null), 150); // if the browser declined the drop, don't let it linger
            }}
            spellCheck
          />
        </div>

        <div className="study-editor-pane">
          <div className="study-pane-head">
            <span>Preview</span>
          </div>
          <div
            ref={previewRef}
            className={`study-preview${armed !== null ? " armed" : ""}`}
            onDragOver={(e) => {
              if (!isNoteDrag(e)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
              updateHover(e.clientX, e.clientY);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHighlight(null);
            }}
            onDrop={(e) => {
              if (!isNoteDrag(e)) return;
              e.preventDefault();
              setHighlight(null);
              const n = Number(e.dataTransfer.getData(NOTE_MIME));
              if (n) placeNote(n, e.clientX, e.clientY);
            }}
            onPointerMove={(e) => {
              if (armed !== null) updateHover(e.clientX, e.clientY);
            }}
            onPointerLeave={() => {
              if (armed !== null) setHighlight(null);
            }}
            onClick={(e) => {
              if (armed === null) return;
              e.preventDefault(); // don't follow a link when the click is a placement
              if (placeNote(armed, e.clientX, e.clientY)) {
                setArmed(null);
                setHighlight(null);
              }
            }}
          >
            {renderMarkdown(deferredBody, onNavigate, { extended: true, notes: noteTexts })}
          </div>
        </div>
      </div>

      <details className="study-md-help">
        <summary>Markdown help</summary>
        <div>
          <code># Heading</code> · <code>## Subheading</code> · <code>**bold**</code> · <code>*italic*</code> · <code>`code`</code> · <code>- bullet</code> · <code>1. numbered</code> ·{" "}
          <code>&gt; quote</code> · <code>---</code> rule · <code>[text](https://…)</code> link · <code>![alt](url)</code> image · <code>```</code> fenced code · <code>[1]</code> footnote (drag a note
          onto a word instead of typing it)
        </div>
      </details>
    </div>
  );
}
