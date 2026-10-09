import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { MessageDTO } from "../lib/types";

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const isLink = (v: string) => /^https:\/\//.test(v);
interface PollState { mine: number | null; total: number; counts: number[] | null }

/** Poll and blind A/B share one body: options to tap; the split appears only after you have voted. */
function PollBody({ m, options, children }: { m: MessageDTO; options: string[]; children?: React.ReactNode }) {
  const { user } = useAuth();
  const [st, setSt] = useState<PollState | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => { api<PollState>(`/api/messages/${m.id}/poll`).then(setSt).catch(() => {}); }, [m.id]);
  useEffect(() => {
    load();
    const on = (e: Event) => { if ((e as CustomEvent).detail === m.id) load(); };
    window.addEventListener("exomusica:poll", on);
    return () => window.removeEventListener("exomusica:poll", on);
  }, [load]);
  async function vote(i: number) {
    setErr(null);
    try { await api(`/api/messages/${m.id}/vote`, { method: "POST", body: JSON.stringify({ option: i }) }); load(); } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't vote"); }
  }
  const total = Math.max(1, st?.total ?? 0);
  return (
    <div data-testid="poll">
      {children}
      <ul className="poll-opts">
        {options.map((o, i) => {
          const n = st?.counts?.[i];
          return (
            <li key={i}>
              <button type="button" className={`poll-opt${st?.mine === i ? " mine" : ""}`} disabled={!user} onClick={() => void vote(i)} aria-pressed={st?.mine === i} data-testid="poll-opt">
                {n !== undefined && <span className="poll-fill" style={{ width: `${(n / total) * 100}%` }} aria-hidden="true" />}
                <span className="poll-label">{o}</span>{n !== undefined && <span className="poll-n">{n}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="home-dim poll-foot">{st ? `${st.total} ${st.total === 1 ? "vote" : "votes"}${st.counts === null ? " · results show after you vote" : ""}` : "…"}{!user && " · log in to vote"}</p>
      {err && <p className="an-err" role="alert">{err}</p>}
    </div>
  );
}

/** The body of a structured message: a call, a signal report, a poll, a blind A/B, a clip. */
export function KindCard({ m, onReply }: { m: MessageDTO; onReply: (m: MessageDTO) => void }) {
  const d = (m.data ?? {}) as Record<string, unknown>;
  const str = (k: string) => String(d[k] ?? "");
  switch (m.kind) {
    case "cq": {
      const wants = Array.isArray(d.wants) ? (d.wants as string[]) : [];
      return (
        <div className="kcard kcard-cq" data-testid="card-cq">
          <span className="kcard-tag">CQ</span> <b>{str("topic")}</b>
          {wants.length > 0 && <span className="kcard-chips">{wants.map((w) => <i key={w}>{w}</i>)}</span>}
          <button type="button" className="btn kcard-act" onClick={() => onReply(m)}>Answer</button>
        </div>
      );
    }
    case "report": {
      const t = str("target");
      return (
        <div className="kcard kcard-report" data-testid="card-report">
          <span className="kcard-tag">Report</span>
          <span className="kcard-rst" aria-label={`Readability ${str("r")}, strength ${str("s")}, tone ${str("t")}`}><b>{str("r")}</b><b>{str("s")}</b><b>{str("t")}</b></span>
          <span className="kcard-target">{isLink(t) ? <a href={t} target="_blank" rel="noreferrer">{t.replace(/^https:\/\//, "")}</a> : t}</span>
          {str("note") && <p className="home-dim">{str("note")}</p>}
        </div>
      );
    }
    case "poll":
      return <div className="kcard" data-testid="card-poll"><span className="kcard-tag">Poll</span> <b>{str("q")}</b><PollBody m={m} options={Array.isArray(d.options) ? (d.options as string[]) : []} /></div>;
    case "ab":
      return (
        <div className="kcard" data-testid="card-ab"><span className="kcard-tag">A/B</span> <b>{str("q")}</b>
          <PollBody m={m} options={["A", "B"]}>
            <div className="kcard-ab"><label>A <audio controls preload="none" src={str("a")} /></label><label>B <audio controls preload="none" src={str("b")} /></label></div>
          </PollBody>
        </div>
      );
    case "clip": {
      const from = Number(d.from) || 0, to = Number(d.to) || 0;
      const src = m.embeds[0]?.fileUrl ?? str("url"); // a track of the site plays from its own file
      return (
        <div className="kcard" data-testid="card-clip"><span className="kcard-tag">Clip</span> <b>{str("label") || "listen here"}</b> <span className="home-dim mono">{mmss(from)}–{mmss(to)}</span>
          <audio controls preload="none" src={`${src}#t=${from},${to}`} aria-label={`Clip ${mmss(from)} to ${mmss(to)}`} />
        </div>
      );
    }
    default: return null;
  }
}
