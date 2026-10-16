import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { terminalName, type TerminalCtx } from "../lib/terminal";

/** A page of the site, shown inside a room's terminal. The frame is same-origin and sandboxed without top navigation, so a link cannot take the whole window away.
 *  Inside, the frame runs the terminal's own shell (see TerminalShell): no site chrome, and links stay in the room's reach. "Leave" takes you to the whole site, at the page the frame is on. */
export function PageTerminal({ path, title, ctx, color, onClose }: { path: string; title: string; ctx: TerminalCtx; color: string; onClose: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const navigate = useNavigate();
  const leave = () => {
    let to = path;
    try { const l = frame.current?.contentWindow?.location; if (l) to = `${l.pathname}${l.search}${l.hash}`; } catch { /* frame not ready: leave at its first page */ }
    onClose();
    navigate(to);
  };
  return (
    <div className="rt pt" data-testid="page-terminal" role="dialog" aria-modal="true" aria-label={`${title} (terminal)`} style={{ ["--rm" as string]: color }}>
      <div className="rt-bezel">
        <div className="rt-glass pt-glass">
          <header className="rt-head">
            <span className="rt-prompt">&gt; {title}</span>
            <span className="pt-actions">
              <button type="button" className="rt-x" onClick={leave} data-testid="terminal-leave" title="Leave the terminal and explore the whole site">leave ↗</button>
              <button type="button" className="rt-x" onClick={onClose} data-testid="terminal-close" aria-label="Close terminal">esc ✕</button>
            </span>
          </header>
          <div className="rt-body pt-body">
            <iframe
              ref={frame}
              className="pt-frame"
              title={`${title}, terminal`}
              name={terminalName(ctx)}
              src={path}
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-downloads"
              data-testid="terminal-frame"
            />
          </div>
          <div className="rt-scan" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
