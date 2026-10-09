import { useLensStore } from "../lib/lensStore";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { parseCommand, peekOf, type Entity } from "../lib/atlas";
import { runCommand, suggest, type Out, type Suggestion } from "../lib/actions";
import { operator } from "../lib/operator";
import { setArrival } from "../lib/arrive";
import { usePocketStore } from "../lib/pocketStore";
import { useTerminalStore } from "../lib/terminalStore";
import { useIndex } from "../lib/useAtlas";
import { isTypingTarget } from "../lib/isTypingTarget";
import { Plate } from "./Plate";

// What was typed and printed survives closing and reopening the terminal (for this visit).
let lines: Out[] = [];
let past: string[] = [];

/**
 * The Master Terminal: type a name to go there, or a command to do something. It is the keyboard path through the whole site; nothing needs it.
 * Everything it can do comes from the action registry (lib/actions.ts), so it never drifts from what the buttons do.
 */
export function Terminal({ focus }: { focus: Entity | null }) {
  const open = useTerminalStore((s) => s.open);
  const prefill = useTerminalStore((s) => s.prefill);
  const hide = useTerminalStore((s) => s.hide);
  const toggle = useTerminalStore((s) => s.toggle);
  const { user } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();
  const pocket = usePocketStore();
  const index = useIndex(open);
  const [value, setValue] = useState("");
  const [, bump] = useState(0);
  const [sel, setSel] = useState(-1);
  const [hist, setHist] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const outRef = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  // Ctrl/Cmd+K anywhere; ` or : when not typing in a field.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") { e.preventDefault(); toggle(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      if (e.key === "`" || e.key === ":") { e.preventDefault(); useTerminalStore.getState().show(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  useEffect(() => {
    if (!open) return;
    returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setValue(prefill); setSel(-1); setHist(-1);
    if (!lines.length) { lines = [{ kind: "text", text: operator.greet() }]; bump((n) => n + 1); }
    requestAnimationFrame(() => inputRef.current?.focus());
    return () => { returnTo.current?.focus?.(); };
  }, [open, prefill]);
  useEffect(() => { outRef.current?.scrollTo({ top: outRef.current.scrollHeight }); });

  const parsed = useMemo(() => parseCommand(value), [value]);
  const suggestions: Suggestion[] = useMemo(() => (open ? suggest(value, parsed, index) : []), [open, value, parsed, index]);
  useEffect(() => setSel(-1), [value]);

  if (!open) return null;

  function go(to: string) { setArrival("top"); navigate(to); hide(); }
  function submit() {
    const input = value.trim();
    if (!input) return;
    if (sel >= 0 && suggestions[sel]) {
      const s = suggestions[sel];
      go(s.kind === "place" ? s.to : peekOf(s.entity).href);
      return;
    }
    past = [input, ...past.filter((x) => x !== input)].slice(0, 40);
    let navigated = false;
    const out = runCommand(input, parseCommand(input), {
      go: (to) => { navigated = true; setArrival("top"); navigate(to); },
      back: () => { navigated = true; navigate(-1); },
      user: user ? { username: user.username, isAdmin: user.isAdmin } : null,
      index,
      focus,
      pocket: { items: pocket.items, add: pocket.add, remove: pocket.remove, clear: pocket.clear },
      pathname: loc.pathname + loc.search,
      rand: Math.random,
      lens: { on: useLensStore.getState().on, set: useLensStore.getState().set },
    });
    if (out.some((o) => o.kind === "clear")) lines = [];
    else lines = [...lines, { kind: "text" as const, text: `› ${input}` }, ...out].slice(-60);
    setValue(""); setHist(-1);
    if (navigated) hide(); else bump((n) => n + 1);
  }
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { e.preventDefault(); hide(); return; }
    if (e.key === "Enter") { e.preventDefault(); submit(); return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const dir = e.key === "ArrowDown" ? 1 : -1;
      if (suggestions.length) setSel((c) => Math.min(suggestions.length - 1, Math.max(-1, c + dir)));
      else if (past.length) {
        const next = Math.max(-1, Math.min(past.length - 1, hist + (dir === -1 ? 1 : -1)));
        setHist(next); setValue(next === -1 ? "" : past[next]);
      }
      return;
    }
    if (e.key === "Tab" && suggestions.length) {
      e.preventDefault();
      const s = suggestions[sel >= 0 ? sel : 0];
      setValue(s.kind === "place" ? s.label.toLowerCase() : s.entity.title);
    }
  }

  return (
    <div className="term-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) hide(); }} data-testid="terminal-backdrop">
      <div className="term" role="dialog" aria-modal="true" aria-label="Master Terminal" data-testid="terminal">
        <div className="term-out" ref={outRef} aria-live="polite" data-testid="terminal-out">
          {lines.map((l, i) => (
            l.kind === "peek" ? <div key={i} className="term-line"><Plate peek={l.peek} note={l.note} edge="top" onPick={hide} /></div>
            : l.kind === "link" ? <div key={i} className="term-line"><a href={l.to}>{l.text}</a></div>
            : l.kind === "clear" ? null
            : <div key={i} className={`term-line${l.kind === "error" ? " err" : ""}${l.text.startsWith("›") ? " cmd" : ""}`}>{l.text}</div>
          ))}
          {open && index.length === 0 && <div className="term-line dim">Warming the dial…</div>}
        </div>
        {suggestions.length > 0 && (
          <ul className="term-sugg" role="listbox" aria-label="Suggestions" data-testid="terminal-suggestions">
            {suggestions.map((s, i) => (
              <li key={s.kind === "place" ? `p-${s.to}` : `e-${s.entity.type}-${s.entity.id}`} role="option" aria-selected={i === sel} className={i === sel ? "on" : ""}
                onMouseDown={(e) => { e.preventDefault(); go(s.kind === "place" ? s.to : peekOf(s.entity).href); }}>
                {s.kind === "place" ? <><span className="term-sugg-kind">place</span>{s.label}</> : <><span className="term-sugg-kind">{s.entity.type}</span>{s.entity.title}{s.entity.sub ? <i>{s.entity.sub}</i> : null}</>}
              </li>
            ))}
          </ul>
        )}
        <div className="term-in">
          <span aria-hidden="true">›</span>
          <input ref={inputRef} value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={onKeyDown} placeholder="Type a name, or ? for commands" aria-label="Command" autoComplete="off" autoCapitalize="off" spellCheck={false} enterKeyHint="go" data-testid="terminal-input" />
        </div>
        <div className="term-foot" aria-hidden="true">Enter go · ↑↓ pick · Tab fill · Esc close · ? help</div>
      </div>
    </div>
  );
}
