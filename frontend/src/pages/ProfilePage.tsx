import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { isTypingTarget } from "../lib/isTypingTarget";
import { useIsDesktop } from "../lib/useIsDesktop";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { MailIcon } from "../components/Icons";

interface Profile {
  id: number;
  username: string;
  avatarUrl: string | null;
  bio: string | null;
  links: { label: string; url: string }[] | null;
  isGhost: boolean;
  createdAt: string;
}

interface Stats { signals: number; trace: number[]; studies: { slug: string; title: string; status: string }[] }

/** 14 days of messages as a thin bar trace. Pure SVG, no state. */
function Trace({ trace }: { trace: number[] }) {
  const max = Math.max(1, ...trace);
  const w = 280, h = 44, gap = 3, bw = (w - gap * (trace.length - 1)) / trace.length;
  return (
    <svg className="profile-trace" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Signals per day, last ${trace.length} days`}>
      {trace.map((n, i) => {
        const bh = n === 0 ? 1.5 : Math.max(3, (n / max) * (h - 2));
        return <rect key={i} x={i * (bw + gap)} y={h - bh} width={bw} height={bh} rx={1} className={n === 0 ? "pt-zero" : "pt-on"}><title>{n} signal{n === 1 ? "" : "s"}</title></rect>;
      })}
    </svg>
  );
}

export function ProfilePage() {
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const [stats, setStats] = useState<Stats | null>(null);
  const { username } = useParams<{ username: string }>();
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    if (!username) return;
    api<Profile>(`/api/users/${username}`).then(setProfile);
  }, [username]);

  useEffect(() => {
    if (!username) return;
    setStats(null);
    api<Stats>(`/api/users/${encodeURIComponent(username)}/stats`).then(setStats).catch(() => setStats(null)); // ghosts have none
  }, [username]);

  useEffect(() => {
    if (!isDesktop) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === "KeyR") navigate("/members");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isDesktop, navigate]);

  if (!profile) return <p>Loading…</p>;

  return (
    <div className="page-column" style={{ maxWidth: 480 }}>
      <Link to="/members" className="profile-back" data-testid="profile-back">← Members{isDesktop && <kbd>R</kbd>}</Link>
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          background: profile.avatarUrl ? `url(${profile.avatarUrl}) center/cover` : "var(--bg-elevated)",
        }}
      />
      <h1 style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
        {profile.username}
        {user && user.username !== profile.username && !profile.isGhost && (
          <Link to={`/pms/${profile.username}`} title="Send a message" style={{ color: "var(--accent-forum)", display: "inline-flex" }}>
            <MailIcon size={18} />
          </Link>
        )}
      </h1>
      {profile.isGhost && <p style={{ color: "var(--text-dim)" }}>This account is no longer active.</p>}
      {profile.bio && <p>{profile.bio}</p>}
      {profile.links && profile.links.length > 0 && (
        <ul>
          {profile.links.map((l) => (
            <li key={l.url}>
              <a href={l.url} target="_blank" rel="noreferrer">
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      )}
      {stats && (
        <section className="profile-stats" data-testid="profile-stats" aria-label="Activity">
          <div className="ps-row">
            <div><b>{stats.signals.toLocaleString()}</b><span>Signals</span></div>
            <div><b>{stats.studies.length}</b><span>{stats.studies.length === 1 ? "Study" : "Studies"}</span></div>
          </div>
          <Trace trace={stats.trace} />
          <span className="ps-cap">Signals · last 14 days</span>
          {stats.studies.length > 0 && (
            <ul className="ps-studies">
              {stats.studies.map((s) => <li key={s.slug}><Link to={`/study/${s.slug}`}>{s.title}</Link></li>)}
            </ul>
          )}
        </section>
      )}
      {user && user.username !== profile.username && !profile.isGhost && (
        <Link className="btn" to={`/pms/${profile.username}`}>
          Message
        </Link>
      )}
    </div>
  );
}
