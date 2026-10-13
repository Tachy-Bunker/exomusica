import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DmButton } from "../components/DmButton";
import { useAuth } from "../lib/auth";
import { loadMembers, useLoaded } from "../lib/hubs";
import { chatLines, layoutStars } from "../lib/constellation";
import { usePresenceStore } from "../lib/presenceStore";
import { filterMembers, initialOf, monthYear, nameHue, sortMembers, type Member, type MemberFilter, type MemberSort } from "../lib/spaceHubs";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { useUrlParams } from "../lib/useUrlParams";

const SORTS: { id: MemberSort; label: string }[] = [
  { id: "newest", label: "Newest" },
  { id: "active", label: "Most active" },
  { id: "az", label: "A to Z" },
];
const PAGE = 60;

function Avatar({ m, inChat }: { m: Member; inChat: boolean }) {
  return (
    <span className="crew-avatar-wrap">
      {m.avatarUrl ? (
        <img className="crew-avatar" src={m.avatarUrl} alt="" loading="lazy" width={56} height={56} />
      ) : (
        <span className="crew-avatar crew-avatar-letter" style={{ background: `hsl(${nameHue(m.username)} 38% 26%)` }} aria-hidden="true">{initialOf(m.username)}</span>
      )}
      {inChat && <span className="crew-beacon" title="In a chat now" aria-label="In a chat now" />}
    </span>
  );
}

export function MembersPage() {
  useDocumentTitle("Members");
  const { user } = useAuth();
  const { data, failed } = useLoaded(loadMembers);
  const [params, setUrlParam] = useUrlParams();
  const viewers = usePresenceStore((s) => s.viewersByChannel);
  const [limit, setLimit] = useState(PAGE);
  const sky = params.get("view") === "sky";

  const filterParam = params.get("show");
  const filter: MemberFilter = filterParam === "new" || filterParam === "active" || filterParam === "chat" ? filterParam : "all";
  const sortParam = params.get("sort");
  const sort: MemberSort = SORTS.some((s) => s.id === sortParam) ? (sortParam as MemberSort) : "active"; // most active first by default
  const query = params.get("q") ?? "";
  const setParam = (key: string, value: string, fallback: string) => {
    setLimit(PAGE); // a different view starts again at the first page
    setUrlParam(key, value, fallback);
  };

  const inChat = useMemo(() => new Set([...viewers.values()].flat()), [viewers]);
  const all = data?.members ?? [];
  const now = Date.now();
  const shown = useMemo(() => sortMembers(filterMembers(all, filter, query, inChat, now), sort), [all, filter, query, inChat, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const newCount = useMemo(() => filterMembers(all, "new", "", inChat, now).length, [all, inChat]); // eslint-disable-line react-hooks/exhaustive-deps
  const activeCount = useMemo(() => filterMembers(all, "active", "", inChat, now).length, [all, inChat]); // eslint-disable-line react-hooks/exhaustive-deps

  const chips: { id: MemberFilter; label: string; n: number }[] = [
    { id: "all", label: "Everyone", n: all.length },
    { id: "new", label: "New this month", n: newCount },
    { id: "active", label: "Active this month", n: activeCount },
    ...(inChat.size > 0 ? [{ id: "chat" as const, label: "In chat now", n: all.filter((m) => inChat.has(m.username)).length }] : []),
  ];

  return (
    <div className="home-page space-page" data-testid="members-page">
      <header className="home-hero">
        <h1>Members</h1>
        {!user && data && <p className="home-dim" data-testid="members-login-note"><Link to="/login">Log in</Link> to send a message.</p>}
      </header>

      <section aria-label="Find a member">
        <div className="space-controls">
          <input type="search" className="space-search" placeholder="Search by name or bio" aria-label="Search members" value={query} onChange={(e) => setParam("q", e.target.value, "")} data-testid="members-search" />
          <label className="space-sort">
            <span className="home-dim">Sort</span>
            <select value={sort} onChange={(e) => setParam("sort", e.target.value, "active")} aria-label="Sort members" data-testid="members-sort">
              {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
        </div>
        <div className="space-chips" role="group" aria-label="How to show members">
          <button type="button" className="space-chip" aria-pressed={!sky} onClick={() => setUrlParam("view", "cards", "cards")} data-testid="members-view-cards">Cards</button>
          <button type="button" className="space-chip" aria-pressed={sky} onClick={() => setUrlParam("view", "sky", "cards")} data-testid="members-view-sky">Constellation</button>
        </div>
        <div className="space-chips" role="group" aria-label="Which members">
          {chips.map((c) => (
            <button key={c.id} type="button" className="space-chip" aria-pressed={filter === c.id} onClick={() => setParam("show", c.id, "all")} data-testid={`members-filter-${c.id}`}>
              {c.label} <span className="space-chip-n">{c.n}</span>
            </button>
          ))}
        </div>
      </section>

      {!data ? (
        <div className="home-placeholder" aria-busy={!failed}>{failed ? "Couldn't load the members. Reload to try again." : "Reading the crew manifest…"}</div>
      ) : shown.length === 0 ? (
        <p className="home-dim" data-testid="members-empty">{all.length === 0 ? "No members yet." : "Nobody matches. Try fewer words, or clear the filter."}</p>
      ) : sky ? (
        <Sky members={shown} inChat={inChat} />
      ) : (
        <>
          <div className="space-grid" data-testid="members-list">
            {shown.slice(0, limit).map((m) => (
              <article key={m.username} className="crew-card" data-username={m.username}>
                <Avatar m={m} inChat={inChat.has(m.username)} />
                <div className="crew-main">
                  <h3 className="sig-title"><Link className="sig-link uname-color" to={`/u/${encodeURIComponent(m.username)}`}>{m.username}</Link><DmButton username={m.username} /></h3>
                  <p className="home-dim crew-joined">Joined {monthYear(m.joinedAt)}</p>
                  {m.bio && <p className="crew-bio">{m.bio}</p>}
                  <p className="sig-meta home-dim">
                    {m.studies} {m.studies === 1 ? "study" : "studies"} · {m.messages} {m.messages === 1 ? "message" : "messages"} this month
                  </p>
                </div>
                {user && user.username !== m.username && (
                  <Link className="btn crew-message" to={`/pms/${encodeURIComponent(m.username)}`} aria-label={`Message ${m.username}`}>Message</Link>
                )}
              </article>
            ))}
          </div>
          {shown.length > limit && (
            <p><button type="button" className="btn" onClick={() => setLimit((l) => l + PAGE)} data-testid="members-more">Show {Math.min(PAGE, shown.length - limit)} more</button> <span className="home-dim">showing {limit} of {shown.length}</span></p>
          )}
        </>
      )}
    </div>
  );
}

/** Members as stars: bigger the more they speak, lit and joined by lines when they are in a chat now. Plain SVG, no animation loop; only the lit stars pulse, in CSS. */
function Sky({ members, inChat }: { members: Member[]; inChat: Set<string> }) {
  const stars = useMemo(() => layoutStars(members, inChat), [members, inChat]);
  const lines = useMemo(() => chatLines(stars), [stars]);
  return (
    <svg className="sky" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" role="group" aria-label="Members as a constellation" data-testid="members-sky">
      {lines.map(([a, b], i) => <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="sky-line" />)}
      {stars.map((s) => (
        <Link key={s.username} to={`/u/${encodeURIComponent(s.username)}`} data-testid="sky-star" data-lit={s.lit ? "1" : "0"}>
          <title>{s.username}{s.lit ? " (in a chat now)" : ""}</title>
          <circle cx={s.x} cy={s.y} r={Math.max(3, s.r * 2.2)} fill="transparent" />
          <circle cx={s.x} cy={s.y} r={s.r} className={`sky-star${s.lit ? " lit" : ""}`} />
          {(s.lit || s.r > 2) && <text x={s.x} y={s.y - s.r - 1.2} className="sky-name">{s.username}</text>}
        </Link>
      ))}
    </svg>
  );
}
