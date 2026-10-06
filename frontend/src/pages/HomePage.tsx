import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { HomeExplore } from "../components/HomeExplore";
import { api } from "../lib/api";
import { useAudioStore } from "../lib/audioStore";
import { useAuth } from "../lib/auth";
import { useHome, type HomeActivity } from "../lib/home";
import { useProfileStore } from "../lib/profileStore";
import { timeAgo } from "../lib/relativeTime";
import type { PlayableTrackDTO } from "../lib/types";
import { useDocumentTitle } from "../lib/useDocumentTitle";

interface MyStudy { slug: string; title: string; status: string; updatedAt: string; owner: string }

const WAYS = [
  { to: "/soundbay", name: "Soundbay", line: "Wander through the sound", more: "Branches, albums, playlists" },
  { to: "/xenolab", name: "XenoLab", line: "See how it's made", more: "Studies, tools, measurements" },
  { to: "/telemetry", name: "Telemetry", line: "Join the conversation", more: "Chats, challenges, samples" },
];

export function HomePage() {
  useDocumentTitle("");
  const { user } = useAuth();
  const { home, failed } = useHome();
  const [params] = useSearchParams();
  const hasUnreadPms = useProfileStore((s) => s.hasUnreadPms);
  const play = useAudioStore((s) => s.play);
  const addToQueue = useAudioStore((s) => s.addToQueue);
  const [listening, setListening] = useState(false);
  const [myStudies, setMyStudies] = useState<MyStudy[] | null>(null);

  // Only members' own work needs another request, and only after the page has appeared.
  useEffect(() => {
    if (!user) { setMyStudies(null); return; }
    let alive = true;
    api<MyStudy[]>("/api/studies").then((all) => alive && setMyStudies(all.filter((s) => s.owner === user.username).slice(0, 3))).catch(() => alive && setMyStudies([]));
    return () => { alive = false; };
  }, [user]);

  async function listenNow() {
    if (listening) return;
    setListening(true);
    try {
      const tracks = await api<PlayableTrackDTO[]>("/api/tracks/shuffle");
      if (tracks.length === 0) return;
      const [first, ...rest] = tracks;
      play(first);
      addToQueue(rest);
    } finally {
      setListening(false);
    }
  }

  const stats = home?.stats;
  return (
    <div className="home-page" data-testid="home-page">
      {user ? (
        <header className="home-hero" data-testid="home-member-hero">
          <h1>Welcome back, {user.username}</h1>
          <div className="home-chips">
            {hasUnreadPms && <Link className="home-chip home-chip-alert" to="/pms">New message</Link>}
            <Link className="home-chip" to="/telemetry">Telemetry</Link>
            <Link className="home-chip" to="/xenolab">XenoLab</Link>
          </div>
          {myStudies && myStudies[0] && (
            <Link className="home-card home-continue" to={`/study/${myStudies[0].slug}`}>
              <span className="home-card-tag">Continue your latest study</span>
              <span className="home-card-title">{myStudies[0].title}</span>
              <span className="home-dim">{timeAgo(new Date(myStudies[0].updatedAt).getTime())}</span>
            </Link>
          )}
        </header>
      ) : (
        <header className="home-hero" data-testid="home-visitor-hero">
          <h1>Experimental music that's easy to get into.</h1>
          <p className="home-lede">A community and lab. Listen to branches of new sound, read the research behind it, and make your own.</p>
          <div className="home-cta">
            <button type="button" className="btn btn-primary" onClick={listenNow} disabled={listening} data-testid="listen-now">{listening ? "Loading…" : "Listen now"}</button>
            <Link className="btn" to="/xenolab">Browse XenoLab</Link>
            <Link className="btn" to="/join" data-testid="hero-join">Request to join</Link>
          </div>
          <p className="home-stats" data-testid="home-stats">
            {stats ? (
              <>
                <Link to="/members">{stats.members.toLocaleString()} members</Link>
                <Link to="/soundbay">{stats.tracks.toLocaleString()} tracks</Link>
                <Link to="/studies">{stats.studies.toLocaleString()} studies</Link>
                <Link to="/soundbay">{stats.branches.toLocaleString()} branches</Link>
              </>
            ) : "\u00a0"}
          </p>
        </header>
      )}

      {home ? (
        <HomeExplore branches={home.branches} openFull={params.get("map") === "full"} />
      ) : (
        <section className="home-section"><h2 className="home-h2">Explore the branches</h2><div className="home-placeholder" aria-busy={!failed}>{failed ? "Couldn't load the branches. Reload to try again." : "Loading…"}</div></section>
      )}

      <section className="home-section" aria-labelledby="home-now-h">
        <div className="home-h2-row"><h2 id="home-now-h" className="home-h2">Happening now</h2><span className="home-dim">newest first</span></div>
        {home ? (
          home.activity.length ? (
            <div className="home-grid" data-testid="activity">
              {home.activity.map((a: HomeActivity, i) => (
                <Link key={`${a.kind}-${a.href}-${i}`} className="home-card" to={a.href} data-kind={a.kind}>
                  <span className="home-card-tag">{a.label}</span>
                  <span className="home-card-title">{a.title}</span>
                  <span className="home-dim home-card-meta">{[a.detail, timeAgo(a.at)].filter(Boolean).join(" · ")}</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="home-dim">It's quiet right now. Be the first to start something.</p>
          )
        ) : (
          <div className="home-placeholder" aria-busy={!failed}>{failed ? "Couldn't load the latest activity." : "Loading…"}</div>
        )}
      </section>

      <section className="home-section" aria-labelledby="home-ways-h">
        <h2 id="home-ways-h" className="home-h2">{user ? "Jump to" : "Three ways in"}</h2>
        <div className="home-ways">
          {WAYS.map((w) => (
            <Link key={w.to} className="home-card" to={w.to}>
              <span className="home-card-tag">{w.name}</span>
              <span className="home-card-title">{w.line}</span>
              <span className="home-dim home-card-meta">{w.more}</span>
            </Link>
          ))}
        </div>
      </section>

      {user ? (
        myStudies && myStudies.length > 0 && (
          <section className="home-section" aria-labelledby="home-work-h" data-testid="home-your-work">
            <div className="home-h2-row"><h2 id="home-work-h" className="home-h2">Your work</h2><Link to="/studies" className="home-dim">All studies</Link></div>
            <div className="home-grid">
              {myStudies.map((s) => (
                <Link key={s.slug} className="home-card" to={`/study/${s.slug}`}>
                  <span className="home-card-tag">{s.status === "COMPLETE" ? "Complete" : "In progress"}</span>
                  <span className="home-card-title">{s.title}</span>
                  <span className="home-dim home-card-meta">{timeAgo(new Date(s.updatedAt).getTime())}</span>
                </Link>
              ))}
            </div>
          </section>
        )
      ) : (
        <section className="home-join" data-testid="home-join-band" aria-labelledby="home-join-h">
          <div>
            <h2 id="home-join-h" className="home-h2">Join in a few minutes</h2>
            <p className="home-dim home-join-text">Everything above is open to read now. Send a request with a name and a line about why; we review by hand, and posting and messaging open when you're approved.</p>
          </div>
          <Link className="btn btn-primary" to="/join">Request to join</Link>
        </section>
      )}
    </div>
  );
}
