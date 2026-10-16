import { useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { terminalAllows, type TerminalCtx } from "../lib/terminal";
import { useAudioStore } from "../lib/audioStore";

/** The page's player, seen from the terminal. It has no audio of its own: the page's player plays, this only shows it and steers it. */
function TerminalTransport() {
  const track = useAudioStore((s) => s.currentTrack);
  const playing = useAudioStore((s) => s.isPlaying);
  const toggle = useAudioStore((s) => s.toggle);
  const next = useAudioStore((s) => s.playNext);
  if (!track) return null;
  return (
    <div className="pt-transport" data-testid="terminal-transport">
      <button type="button" className="pt-play" onClick={toggle} aria-label={playing ? "Pause" : "Play"}>{playing ? "❚❚" : "▶"}</button>
      <span className="pt-title">{track.title}</span>
      <button type="button" className="pt-next" onClick={next} aria-label="Next track">⏭</button>
    </div>
  );
}

/** A page inside a room's terminal: the page and its player, and nothing of the site around it (no header, no menus).
 *  A link out of the room's reach, or a redirect, brings the frame back to the room's branch page. The page is not rendered at all while it is out of reach. */
export function TerminalShell({ ctx }: { ctx: TerminalCtx }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const ok = terminalAllows(pathname, ctx);
  useEffect(() => { if (!ok) navigate(`/branch/${ctx.room}`, { replace: true }); }, [ok, pathname, ctx.room, navigate]);
  useEffect(() => { document.documentElement.style.setProperty("--nav-height", "0px"); }, []);
  return (
    <main className="main-content pt-main" data-testid="terminal-main">
      {ok ? <Outlet /> : null}
      <TerminalTransport />
    </main>
  );
}
