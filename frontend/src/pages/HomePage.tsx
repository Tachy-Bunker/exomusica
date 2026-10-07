import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ACTIVITY_ICON } from "../components/ActivityIcons";
import { HomeExplore } from "../components/HomeExplore";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useHome, type HomeActivity } from "../lib/home";
import { useProfileStore } from "../lib/profileStore";
import { Username } from "../components/Username";
import { timeAgo } from "../lib/relativeTime";
import { useDocumentTitle } from "../lib/useDocumentTitle";

interface MyStudy { slug: string; title: string; status: string; updatedAt: string; owner: string }

export function HomePage() {
  useDocumentTitle("");
  const { user } = useAuth();
  const { home, failed } = useHome();
  const [params] = useSearchParams();
  const hasUnreadPms = useProfileStore((s) => s.hasUnreadPms);
  const [myStudies, setMyStudies] = useState<MyStudy[] | null>(null);

  // Only members' own work needs another request, and only after the page has appeared.
  useEffect(() => {
    if (!user) { setMyStudies(null); return; }
    let alive = true;
    api<MyStudy[]>("/api/studies").then((all) => alive && setMyStudies(all.filter((s) => s.owner === user.username).slice(0, 3))).catch(() => alive && setMyStudies([]));
    return () => { alive = false; };
  }, [user]);

  useEffect(() => { if (home && params.get("branch")) document.getElementById("home-explore")?.scrollIntoView({ block: "start" }); }, [home]); // eslint-disable-line react-hooks/exhaustive-deps

  const stats = home?.stats;
  return (
    <div className="home-page" data-testid="home-page">
      {user ? (
        <header className="home-hero" data-testid="home-member-hero">
          <h1>Welcome back, {user.username}</h1>
          {hasUnreadPms && (
            <div className="home-chips">
              <Link className="home-chip home-chip-alert" to="/pms">New message</Link>
            </div>
          )}
          {myStudies && myStudies[0] && (
            <Link className="home-card home-continue" to={`/study/${myStudies[0].slug}`}>
              <span className="home-card-tag">Continue your latest study</span>
              <span className="home-card-title">{myStudies[0].title}</span>
              <span className="home-dim">{timeAgo(new Date(myStudies[0].updatedAt).getTime())}</span>
            </Link>
          )}
        </header>
      ) : (
        <header className="home-hero home-hero-guest" data-testid="home-visitor-hero">
          <div className="hero-main">
            <h1>Alien sonic worlds</h1>
            <p className="home-lede">We want to expand the horizons of music. Here you can listen, chat, research with other Exomusical enthusiasts.</p>
          </div>
          <div className="hero-side">
            <Link className="btn btn-primary hero-join" to="/join" data-testid="hero-join">Join</Link>
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
          </div>
        </header>
      )}

      {home ? (
        <HomeExplore branches={home.branches} openFull={params.get("map") === "full"} initialSlug={params.get("branch")} />
      ) : (
        <section className="home-section"><h2 className="sr-only">Explore the branches</h2><div className="home-placeholder" aria-busy={!failed}>{failed ? "Couldn't load the branches. Reload to try again." : "Loading…"}</div></section>
      )}

      <section className="home-section" aria-labelledby="home-now-h">
        <div className="home-h2-row"><h2 id="home-now-h" className="home-h2">Happening now</h2></div>
        {home ? (
          home.activity.length ? (
            <div className="home-grid" data-testid="activity">
              {home.activity.map((a: HomeActivity, i) => {
                const Icon = ACTIVITY_ICON[a.kind];
                const voice = a.text.startsWith("sent ") || a.text.startsWith("shared ");
                return (
                  <article key={`${a.kind}-${a.href}-${i}`} className="home-card" data-kind={a.kind}>
                    <span className="home-card-head">
                      <Icon size={17} />
                      <span className="sr-only">{a.label}: </span>
                      <Link className="home-card-link home-card-title" to={a.href}>{a.title}</Link>
                    </span>
                    {a.kind === "chat" && a.by && <span className="home-card-preview">{voice ? <><Username name={a.by} /> {a.text}</> : <><Username name={a.by} />: {a.text}</>}</span>}
                    {a.kind === "study" && a.by && <span className="home-card-preview">by <Username name={a.by} /></span>}
                    {a.detail && <span className="home-card-preview">{a.detail}</span>}
                    <span className="home-dim home-card-meta">{timeAgo(a.at)}</span>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="home-dim">It's quiet right now. Be the first to start something.</p>
          )
        ) : (
          <div className="home-placeholder" aria-busy={!failed}>{failed ? "Couldn't load the latest activity." : "Loading…"}</div>
        )}
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
        <section className="home-join" data-testid="home-join-band" aria-label="Join">
          <p className="home-dim home-join-text">To chat, create studies, share music, and participate in our cause of musical innovation!</p>
          <Link className="btn btn-primary" to="/join" data-testid="join-us">Join us</Link>
        </section>
      )}
    </div>
  );
}
