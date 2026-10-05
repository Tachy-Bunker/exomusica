import { useDeferredValue, useEffect, useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { renderInlineMarkdown, renderMarkdown } from "../lib/markdown";
import { insertFigureBlock, insertMarker, snapDroppedBlock, snapDroppedMarker, sourceOffsetForPreviewWord, wordAtPoint } from "../lib/footnotes";
import { useFigures, type FigureChart } from "./StudyFigure";
import { extractHeadings, figureBlockOffsets, type Heading } from "../lib/outline";
import { mapScroll, normalizeAnchors, textareaOffsetTop, type Anchor } from "../lib/scrollSync";
import { useToastStore } from "../lib/toastStore";
import { parseClip, stripClip } from "../lib/clips";

const NOTE_MIME = "application/x-exo-note";
const FIGURE_MIME = "application/x-exo-fig";
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
function isFigureDrag(e: DragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes(FIGURE_MIME);
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
  charts: FigureChart[];
  /** Draws an @audio(url) block (waveform and clip tools). */
  renderAudio: (url: string) => ReactNode;
  /** Uploads a file into this study (so the server can clean it up with the study). */
  uploadFile: (blob: Blob, filename: string) => Promise<string>;
  onAddNote: (text: string) => Promise<void>;
  onNavigate: (path: string) => void;
}

export function StudyEditor({ body, onBodyChange, notes, charts, renderAudio, uploadFile, onAddNote, onNavigate }: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const deferredBody = useDeferredValue(body); // keeps typing snappy on slow devices; the preview catches up
  const [armed, setArmed] = useState<number | null>(null);
  const [newNote, setNewNote] = useState("");
  const [audioOpen, setAudioOpen] = useState(false);
  const [audioUrl, setAudioUrl] = useState("");
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const pendingDrop = useRef<{ marker: string; before: string; block?: boolean } | null>(null);
  const noteTexts = notes.map((n) => n.text); // full text, so footnotes know which notes carry a clip
  const figures = useFigures(charts);
  const headings = extractHeadings(deferredBody);
  const [syncScroll, setSyncScroll] = useState(true);
  const anchorsRef = useRef<Anchor[] | null>(null);
  // When we scroll one pane ourselves, ignore the scroll event that causes in it (and only it).
  const ignoreScroll = useRef<{ pane: "ta" | "pv"; until: number }>({ pane: "ta", until: 0 });

  useEffect(() => () => setHighlight(null), []);
  // Landmark positions are measured lazily (on the next scroll), not on every keystroke - measuring
  // lays text out, which is the sort of work a weak device shouldn't do while you type.
  useEffect(() => {
    anchorsRef.current = null;
  }, [deferredBody, charts]);
  useEffect(() => {
    const invalidate = () => (anchorsRef.current = null);
    window.addEventListener("resize", invalidate);
    return () => window.removeEventListener("resize", invalidate);
  }, []);

  function getAnchors(): Anchor[] {
    if (anchorsRef.current) return anchorsRef.current;
    const ta = taRef.current;
    const pv = previewRef.current;
    if (!ta || !pv) return [];
    const taPad = parseFloat(getComputedStyle(ta).paddingTop) || 0;
    const pvPad = parseFloat(getComputedStyle(pv).paddingTop) || 0;
    const pvTop = pv.getBoundingClientRect().top;
    const list: Anchor[] = [{ a: 0, b: 0 }];
    const add = (sourceIndex: number, el: Element | null) => {
      if (!el) return;
      list.push({ a: textareaOffsetTop(ta, sourceIndex) - taPad, b: el.getBoundingClientRect().top - pvTop + pv.scrollTop - pvPad });
    };
    for (const h of extractHeadings(deferredBody)) add(h.index, pv.querySelector(`#sec-${h.ordinal}`));
    for (const f of figureBlockOffsets(deferredBody)) add(f.index, pv.querySelector(`#${f.kind}-${f.n}`));
    list.push({ a: Math.max(0, ta.scrollHeight - ta.clientHeight), b: Math.max(0, pv.scrollHeight - pv.clientHeight) });
    anchorsRef.current = normalizeAnchors(list);
    return anchorsRef.current;
  }

  function onPaneScroll(from: "ta" | "pv") {
    if (!syncScroll) return;
    const ign = ignoreScroll.current;
    if (ign.pane === from && performance.now() < ign.until) return;
    const ta = taRef.current;
    const pv = previewRef.current;
    if (!ta || !pv) return;
    const target = from === "ta" ? pv : ta;
    ignoreScroll.current = { pane: from === "ta" ? "pv" : "ta", until: performance.now() + 100 };
    target.scrollTop = mapScroll(from === "ta" ? ta.scrollTop : pv.scrollTop, getAnchors(), from === "ta" ? "a" : "b");
  }

  function jumpToHeading(h: Heading) {
    const ta = taRef.current;
    const pv = previewRef.current;
    ignoreScroll.current = { pane: "ta", until: performance.now() + 150 };
    if (ta) {
      ta.focus({ preventScroll: true });
      ta.setSelectionRange(h.index, h.index);
      ta.scrollTop = Math.max(0, textareaOffsetTop(ta, h.index) - (parseFloat(getComputedStyle(ta).paddingTop) || 0));
    }
    const el = pv?.querySelector(`#sec-${h.ordinal}`);
    if (pv && el) {
      ignoreScroll.current = { pane: "pv", until: performance.now() + 150 };
      pv.scrollTop = el.getBoundingClientRect().top - pv.getBoundingClientRect().top + pv.scrollTop - (parseFloat(getComputedStyle(pv).paddingTop) || 0);
    }
  }

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

  // -------------------------------- placing notes and figures at a word
  /** Source offset just after the preview word under (x, y), with a toast explaining any failure. */
  function dropOffset(x: number, y: number): number | null {
    const root = previewRef.current;
    if (!root) return null;
    if (deferredBody !== body) {
      toast("The preview is still updating - try again in a moment");
      return null;
    }
    const hit = wordAtPoint(root, x, y);
    if (!hit) {
      toast("Drop it right on a word");
      return null;
    }
    const offset = sourceOffsetForPreviewWord(root, body, hit.token);
    if (offset === null) {
      toast("Couldn't match that word back to the text - try dropping it in the writing box instead");
      return null;
    }
    return offset;
  }

  function placeNote(n: number, x: number, y: number): boolean {
    const offset = dropOffset(x, y);
    if (offset === null) return false;
    onBodyChange(insertMarker(body, offset, n));
    return true;
  }

  function placeFigure(token: string, x: number, y: number): boolean {
    const offset = dropOffset(x, y);
    if (offset === null) return false;
    onBodyChange(insertFigureBlock(body, offset, token)); // the figure goes after the paragraph the word is in
    return true;
  }

  function insertFigureAtCaret(token: string) {
    const ta = taRef.current;
    const offset = ta ? ta.selectionEnd : body.length;
    const next = insertFigureBlock(body, offset, token);
    const caret = next.indexOf(token, Math.max(0, offset - 1)) + token.length;
    onBodyChange(next);
    requestAnimationFrame(() => {
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(caret, caret);
    });
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
      const snapped = pending.block ? snapDroppedBlock(pending.before, next, pending.marker) : snapDroppedMarker(pending.before, next, pending.marker);
      if (snapped !== null && snapped !== next) {
        const ta = taRef.current;
        const scrollTop = ta?.scrollTop ?? 0;
        const caret = pending.block ? snapped.indexOf(pending.marker, Math.max(0, commonPrefixLength(pending.before, snapped) - 1)) + pending.marker.length : commonPrefixLength(pending.before, snapped) + pending.marker.length;
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

  function insertAudio(url: string) {
    const clean = url.trim();
    if (!/^(\/|https?:\/\/)\S+$/.test(clean)) {
      toast("Enter a link starting with https:// (or upload a file)");
      return;
    }
    insertFigureAtCaret(`@audio(${clean})`);
    setAudioUrl("");
    setAudioOpen(false);
  }

  async function uploadAndInsertAudio(file: File) {
    setUploadingAudio(true);
    try {
      insertAudio(await uploadFile(file, file.name));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadingAudio(false);
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
      {/* pinned under the nav on desktop, so a note or figure can be dragged to a word however far down the paper it is */}
      <div className="study-trays">
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
            title={`${stripClip(n.text)}\n\nDrag onto a word, or click then click a word`}
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
            <b>[{i + 1}]</b>
            {parseClip(n.text) && " ♪"} {stripClip(n.text).length > 28 ? stripClip(n.text).slice(0, 28) + "…" : stripClip(n.text)}
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

      {figures.numbered.length > 0 && (
        <div className="study-notes-tray">
          <span className="study-tray-label">Figures</span>
          {figures.numbered.map((c) => {
            const chart = charts.find((x) => x.id === c.id);
            const token = `{${c.kind}:${c.n}}`;
            const label = c.kind === "fig" ? "Figure" : "Table";
            return (
              <span
                key={c.id}
                role="button"
                tabIndex={0}
                draggable
                className="note-chip"
                title={`${label} ${c.n}: ${chart?.title ?? ""}\n\nClick to insert at the cursor, or drag onto the preview`}
                onDragStart={(e) => {
                  e.dataTransfer.setData(FIGURE_MIME, `${c.kind}:${c.n}`);
                  e.dataTransfer.setData("text/plain", token);
                  e.dataTransfer.effectAllowed = "copy";
                }}
                onDragEnd={() => setHighlight(null)}
                onClick={() => insertFigureAtCaret(token)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    insertFigureAtCaret(token);
                  }
                }}
              >
                <b>
                  {label} {c.n}
                </b>{" "}
                {(chart?.title ?? "").length > 24 ? (chart?.title ?? "").slice(0, 24) + "…" : chart?.title}
              </span>
            );
          })}
          <span className="study-tray-empty">Place with {"{fig:N}"} on its own line, refer to it inline with {"{fig:N}"} in a sentence.</span>
        </div>
      )}

      {armed !== null && (
        <div className="study-armed-hint">
          Click a word in the preview to place <b>[{armed}]</b>{" "}
          <button type="button" className="btn" onClick={() => setArmed(null)}>
            Cancel
          </button>
        </div>
      )}
      </div>

      <div className="study-editor-panes">
        <div className="study-editor-pane">
          <div className="study-pane-head">
            <span>Write</span>
            <span className="study-toolbar">
              <button type="button" className={`btn${audioOpen ? " active" : ""}`} title="Add an audio recording" onMouseDown={(e) => e.preventDefault()} onClick={() => setAudioOpen((v) => !v)}>
                ♪ Audio
              </button>
              {tools.map((t) => (
                <button key={t.format} type="button" className="btn" title={t.title} onMouseDown={(e) => e.preventDefault()} onClick={() => applyFormat(t.format)}>
                  {t.label}
                </button>
              ))}
            </span>
          </div>
          {audioOpen && (
            <div className="audio-insert">
              <input value={audioUrl} onChange={(e) => setAudioUrl(e.target.value)} placeholder="Audio link (https://…)" onKeyDown={(e) => e.key === "Enter" && insertAudio(audioUrl)} />
              <button type="button" className="btn" onClick={() => insertAudio(audioUrl)} disabled={!audioUrl.trim()}>
                Insert
              </button>
              <label className="btn" style={{ cursor: uploadingAudio ? "wait" : "pointer" }}>
                {uploadingAudio ? "Uploading…" : "Upload file…"}
                <input type="file" accept="audio/*" hidden disabled={uploadingAudio} onChange={(e) => e.target.files?.[0] && void uploadAndInsertAudio(e.target.files[0])} />
              </label>
            </div>
          )}
          <textarea
            ref={taRef}
            value={body}
            onChange={handleTextareaChange}
            onKeyDown={handleTextareaKeyDown}
            onScroll={() => onPaneScroll("ta")}
            onDrop={(e) => {
              if (isFigureDrag(e)) {
                pendingDrop.current = { marker: `{${e.dataTransfer.getData(FIGURE_MIME)}}`, before: body, block: true };
                setTimeout(() => (pendingDrop.current = null), 150);
                return;
              }
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
            <label className="study-sync-toggle" title="Keep the writing box and preview scrolled to the same place">
              <input type="checkbox" checked={syncScroll} onChange={(e) => setSyncScroll(e.target.checked)} /> sync scroll
            </label>
          </div>
          <div
            ref={previewRef}
            className={`study-preview${armed !== null ? " armed" : ""}`}
            onScroll={() => onPaneScroll("pv")}
            onDragOver={(e) => {
              if (!isNoteDrag(e) && !isFigureDrag(e)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
              updateHover(e.clientX, e.clientY);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHighlight(null);
            }}
            onDrop={(e) => {
              const fig = isFigureDrag(e) ? e.dataTransfer.getData(FIGURE_MIME) : "";
              if (!fig && !isNoteDrag(e)) return;
              e.preventDefault();
              setHighlight(null);
              if (fig) {
                placeFigure(`{${fig}}`, e.clientX, e.clientY);
                return;
              }
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
            {renderMarkdown(deferredBody, onNavigate, { extended: true, notes: noteTexts, figures: figures.render, figureCounts: figures.counts, audio: renderAudio })}
          </div>
        </div>
      </div>

      {headings.length > 0 && (
        <details className="study-outline">
          <summary>Outline ({headings.length})</summary>
          <ul>
            {headings.map((h) => (
              <li key={h.ordinal} style={{ paddingLeft: `${(h.level - 1) * 0.9}rem` }}>
                <button type="button" onClick={() => jumpToHeading(h)}>
                  {h.text}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

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
