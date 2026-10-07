import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BranchEmblem } from "../components/BranchEmblem";
import { api } from "../lib/api";
import { useAudioStore } from "../lib/audioStore";
import { identityOf } from "../lib/branchIdentity";
import { useChatDockStore } from "../lib/chatDockStore";
import { useHome, type HomeBranch } from "../lib/home";
import { timeAgo } from "../lib/relativeTime";
import { FILTER_LABEL, SECTIONS, SORT_LABEL, filterBranches, filterSimple, sortBranches, sortSimple, type BranchFilterKey, type SectionId, type SoundbaySort } from "../lib/soundbay";
import type { PlayableTrackDTO } from "../lib/types";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { useIsDesktop } from "../lib/useIsDesktop";
import { useUrlParams } from "../lib/useUrlParams";

interface PlaylistRow { slug: string; title: string; owner: string; description: string | null }
interface CommunityAlbumRow { slug: string; title: string; composer: string; coverArtUrl: string | null; owner: { username: string } }
interface AlbumLite { slug: string; title: string; coverArtUrl: string | null }

/** Which section is on screen, so the jump bar can show where you are. */
function useCurrentSection(ids: string[]): string | null {
  const [current, setCurrent] = useState<string | null>(null);
  const key = ids.join("|");
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const seen = new Map<string, number>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) seen.set(e.target.id, e.isIntersecting ? e.boundingClientRect.top : Infinity);
      const visible = [...seen.entries()].filter(([, top]) => top !== Infinity).sort((a, b) => a[1] - b[1]);
      if (visible[0]) setCurrent(visible[0][0]);
    }, { rootMargin: "-20% 0px -65% 0px" });
    ids.forEach((id) => { const el = document.getElementById(id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return current ?? ids[0] ?? null; // before any scrolling, the first section is where you are
}

function BranchRow({ b, open, onToggle }: { b: HomeBranch; open: boolean; onToggle: () => void }) {
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const openChat = useChatDockStore((s) => s.openChat);
  const play = useAudioStore((s) => s.play);
  const addToQueue = useAudioStore((s) => s.addToQueue);
  const clearQueue = useAudioStore((s) => s.clearQueue);
  const [albums, setAlbums] = useState<AlbumLite[] | null>(null);
  const [busy, setBusy] = useState(false);
  const idn = identityOf({ slug: b.slug, color: b.color, glyph: b.glyph, seed: b.seed });

  useEffect(() => { // the albums are fetched the first time the preview is opened, not for every row up front
    if (!open || albums) return;
    api<AlbumLite[]>(`/api/branches/${b.slug}/albums`).then(setAlbums).catch(() => setAlbums([]));
  }, [open, albums, b.slug]);

  const discuss = () => { if (!b.chatSlug) return; if (isDesktop) openChat(b.chatSlug, b.name, b.slug); else navigate(`/branch/${b.slug}`); };
  async function shuffle() {
    if (busy) return;
    setBusy(true);
    try {
      const tracks = await api<PlayableTrackDTO[]>(`/api/branches/${b.slug}/tracks/shuffle`);
      if (tracks.length === 0) return;
      clearQueue();
      const [first, ...rest] = tracks;
      play(first);
      addToQueue(rest);
    } finally { setBusy(false); }
  }

  return (
    <li className={`sb-row${open ? " open" : ""}${b.seed ? " seed" : ""}`} style={{ ["--emb" as string]: idn.color }} data-slug={b.slug} data-testid="branch-row">
      <div className="sb-row-main">
        <BranchEmblem glyph={idn.glyph} color={idn.color} size={40} />
        <div className="sb-row-text">
          <h3 className="sb-row-name"><Link to={`/branch/${b.slug}`}>{b.name}</Link>{b.seed && <span className="home-chip">Growing seed</span>}</h3>
          <p className="sb-row-blurb">{b.blurb || "No description yet."}</p>
          <p className="home-dim sb-row-meta">{b.albums} album{b.albums === 1 ? "" : "s"}{b.lastActiveAt ? ` · active ${timeAgo(b.lastActiveAt)}` : " · no activity yet"}</p>
        </div>
        <div className="sb-actions">
          <button type="button" className="sb-act" aria-expanded={open} aria-controls={`sb-prev-${b.slug}`} onClick={onToggle} data-testid="preview-toggle">{open ? "Hide" : "Preview"}</button>
          <Link className="sb-act" to={`/branch/${b.slug}`} data-testid="row-open">Open</Link>
          {b.chatSlug && <button type="button" className="sb-act sb-extra" onClick={discuss} data-testid="row-discuss">Discussion</button>}
          <Link className="sb-act sb-extra" to={`/?branch=${b.slug}`} data-testid="row-map">Map</Link>
        </div>
      </div>
      {open && (
        <div className="sb-preview" id={`sb-prev-${b.slug}`} data-testid="branch-preview">
          {b.coverArtUrl && <img className="sb-cover" src={b.coverArtUrl} alt="" loading="lazy" width={96} height={96} />}
          <div className="sb-prev-body">
            <p className="sb-prev-blurb">{b.blurb || "No description yet."}</p>
            <p className="sb-prev-label">Albums</p>
            {albums === null ? <p className="home-dim">Loading albums…</p> : albums.length === 0 ? <p className="home-dim">No albums yet.</p> : (
              <ul className="sb-chips">{albums.slice(0, 8).map((a) => <li key={a.slug}><Link to={`/album/${a.slug}`}>{a.title}</Link></li>)}{albums.length > 8 && <li><Link to={`/branch/${b.slug}`}>+{albums.length - 8} more</Link></li>}</ul>
            )}
            <div className="sb-prev-actions">
              <button type="button" className="btn btn-primary" onClick={shuffle} disabled={busy || b.albums === 0} data-testid="prev-play">{busy ? "Loading…" : "Play shuffle"}</button>
              <Link className="btn" to={`/branch/${b.slug}`}>Open branch</Link>
              {b.chatSlug && <button type="button" className="btn" onClick={discuss}>Discussion</button>}
              <Link className="btn" to={`/?branch=${b.slug}`}>On the map</Link>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

export function SoundbayPage() {
  useDocumentTitle("Soundbay");
  const { home, failed } = useHome();
  const play = useAudioStore((s) => s.play);
  const addToQueue = useAudioStore((s) => s.addToQueue);
  const [params, setParam] = useUrlParams();
  const [playlists, setPlaylists] = useState<PlaylistRow[] | null>(null);
  const [albums, setAlbums] = useState<CommunityAlbumRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [openSlugs, setOpenSlugs] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    api<PlaylistRow[]>("/api/playlists").then((p) => alive && setPlaylists(p)).catch(() => alive && setPlaylists([]));
    api<CommunityAlbumRow[]>("/api/community-albums").then((a) => alive && setAlbums(a)).catch(() => alive && setAlbums([]));
    return () => { alive = false; };
  }, []);

  const filterParam = params.get("show");
  const filter: BranchFilterKey = filterParam === "recent" || filterParam === "chat" || filterParam === "albums" ? filterParam : "all";
  const sortParam = params.get("sort");
  const sort: SoundbaySort = sortParam === "az" || sortParam === "albums" ? sortParam : "active";
  const query = params.get("q") ?? "";

  const all = home?.branches ?? [];
  const grown = useMemo(() => sortBranches(filterBranches(all.filter((b) => !b.seed), filter, query), sort), [all, filter, query, sort]);
  const seeds = useMemo(() => sortBranches(filterBranches(all.filter((b) => b.seed), filter, query), sort), [all, filter, query, sort]);
  const lists = useMemo(() => sortSimple(filterSimple(playlists ?? [], query, (p) => `${p.title} ${p.owner} ${p.description ?? ""}`), sort, (p) => p.title), [playlists, query, sort]);
  const albs = useMemo(() => sortSimple(filterSimple(albums ?? [], query, (a) => `${a.title} ${a.composer} ${a.owner.username}`), sort, (a) => a.title), [albums, query, sort]);
  const counts: Record<SectionId, number> = { "sb-branches": grown.length, "sb-seeds": seeds.length, "sb-playlists": lists.length, "sb-albums": albs.length };
  const totalShown = counts["sb-branches"] + counts["sb-seeds"] + counts["sb-playlists"] + counts["sb-albums"];
  const ready = !!home && playlists !== null && albums !== null;
  const searching = query.trim() !== "" || filter !== "all";
  const current = useCurrentSection(SECTIONS.map((s) => s.id));
  const toggle = (slug: string) => setOpenSlugs((s) => { const n = new Set(s); if (n.has(slug)) n.delete(slug); else n.add(slug); return n; });
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  async function shuffleAll() {
    if (busy) return;
    setBusy(true);
    try {
      const tracks = await api<PlayableTrackDTO[]>("/api/tracks/shuffle");
      if (tracks.length === 0) return;
      const [first, ...rest] = tracks;
      play(first);
      addToQueue(rest);
    } finally { setBusy(false); }
  }
  const branchSection = (id: SectionId, title: string, sub: string, rows: HomeBranch[]) => rows.length > 0 && (
    <section id={id} className="sb-section" aria-labelledby={`${id}-h`}>
      <div className="home-h2-row"><h2 id={`${id}-h`} className="home-h2">{title} <span className="home-dim sb-count">{rows.length}</span></h2><span className="home-dim">{sub}</span></div>
      <ul className="sb-list">{rows.map((b) => <BranchRow key={b.slug} b={b} open={openSlugs.has(b.slug)} onToggle={() => toggle(b.slug)} />)}</ul>
    </section>
  );

  return (
    <div className="home-page space-page" data-testid="soundbay-page">
      <header className="home-hero">
        <h1>Soundbay</h1>
        <p className="home-lede">Branches of sound, with their albums and playlists. Search, filter, or just start somewhere.</p>
        <div className="home-cta">
          <button type="button" className="btn btn-primary" onClick={shuffleAll} disabled={busy} data-testid="shuffle-all">{busy ? "Loading…" : "Shuffle everything"}</button>
          <Link className="btn" to="/?map=full" data-testid="open-map">Explore the map</Link>
          <Link className="btn" to="/listen">Player and playlists</Link>
        </div>
      </header>

      <div className="sb-toolbar" data-testid="sb-toolbar">
        <div className="space-controls">
          <input type="search" className="space-search" placeholder="Search branches, playlists and albums" aria-label="Search Soundbay" value={query} onChange={(e) => setParam("q", e.target.value, "")} data-testid="sb-search" />
          <label className="space-sort"><span className="home-dim">Sort</span>
            <select value={sort} onChange={(e) => setParam("sort", e.target.value, "active")} aria-label="Sort Soundbay" data-testid="sb-sort">
              {(Object.keys(SORT_LABEL) as SoundbaySort[]).map((k) => <option key={k} value={k}>{SORT_LABEL[k]}</option>)}
            </select></label>
        </div>
        <div className="space-chips" role="group" aria-label="Show branches">
          {(Object.keys(FILTER_LABEL) as BranchFilterKey[]).map((k) => <button key={k} type="button" className="space-chip" aria-pressed={filter === k} onClick={() => setParam("show", k, "all")} data-testid={`sb-filter-${k}`}>{FILTER_LABEL[k]}</button>)}
        </div>
        <nav className="sb-jump" aria-label="Sections">
          {SECTIONS.map((s) => <button key={s.id} type="button" className="sb-jump-btn" aria-current={current === s.id ? "location" : undefined} onClick={() => jump(s.id)} disabled={counts[s.id] === 0} data-testid={`jump-${s.id}`}>{s.label} <span className="space-chip-n">{ready ? counts[s.id] : "…"}</span></button>)}
        </nav>
      </div>

      {!ready && <div className="home-placeholder" aria-busy={!failed}>{failed ? "Couldn't load the branches. Reload to try again." : "Loading…"}</div>}
      {ready && totalShown === 0 && (
        <p className="home-dim" data-testid="sb-empty">Nothing matches{query ? ` "${query}"` : ""}. <button type="button" className="sb-clear" onClick={() => { setParam("q", "", ""); setParam("show", "all", "all"); }}>Clear the search and filter</button></p>
      )}
      {ready && (
        <>
          {branchSection("sb-branches", "Branches", "where the music lives", grown)}
          {branchSection("sb-seeds", "Growing seeds", "branches just starting", seeds)}
          {lists.length > 0 && (
            <section id="sb-playlists" className="sb-section" aria-labelledby="sb-playlists-h">
              <div className="home-h2-row"><h2 id="sb-playlists-h" className="home-h2">Playlists <span className="home-dim sb-count">{lists.length}</span></h2><span className="home-dim">made by members</span></div>
              <ul className="sb-simple" data-testid="playlist-list">{lists.map((p) => <li key={p.slug}><Link to={`/playlist/${p.slug}`}><b>{p.title}</b></Link><span className="home-dim"> by {p.owner}{p.description ? ` · ${p.description}` : ""}</span></li>)}</ul>
            </section>
          )}
          {albs.length > 0 && (
            <section id="sb-albums" className="sb-section" aria-labelledby="sb-albums-h">
              <div className="home-h2-row"><h2 id="sb-albums-h" className="home-h2">Community albums <span className="home-dim sb-count">{albs.length}</span></h2><span className="home-dim">from members</span></div>
              <ul className="sb-simple" data-testid="album-list">{albs.map((a) => <li key={a.slug}><Link to={`/community-album/${a.slug}`}><b>{a.title}</b></Link><span className="home-dim"> {a.composer || a.owner.username}</span></li>)}</ul>
            </section>
          )}
          {searching && totalShown > 0 && <p className="home-dim sb-found">{totalShown} result{totalShown === 1 ? "" : "s"}</p>}
        </>
      )}
    </div>
  );
}
