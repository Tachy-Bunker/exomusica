import { dragPayload } from "../lib/chatInsert";
import { branchHref } from "../lib/branchLinks";
import { PlayGlow } from "../components/PlayGlow";
import { BranchStudies } from "../components/BranchStudies";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlbumIcon, ChatIcon, MapIcon } from "../components/ActivityIcons";
import { Username } from "../components/Username";
import { BranchEmblem } from "../components/BranchEmblem";
import { PauseIcon, PlayIcon } from "../components/Icons";
import { api } from "../lib/api";
import { useAudioStore } from "../lib/audioStore";
import { identityOf } from "../lib/branchIdentity";
import { useChatDockStore } from "../lib/chatDockStore";
import { useHome, type BranchPicture, type HomeBranch } from "../lib/home";
import { timeAgo } from "../lib/relativeTime";
import { FILTER_LABEL, SECTIONS, SORT_LABEL, filterBranches, filterSimple, pinPlaying, sortBranches, sortSimple, type BranchFilterKey, type SectionId, type SoundbaySort } from "../lib/soundbay";
import type { PlayableTrackDTO } from "../lib/types";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { ShareAutoplay } from "../components/ShareAutoplay";
import { openListParam, parseAutoplay, parseOpenList } from "../lib/shareState";
import { useToastStore } from "../lib/toastStore";
import { useIsDesktop } from "../lib/useIsDesktop";
import { MAP_VIEW_ENABLED } from "../lib/features";
import { useUrlParams } from "../lib/useUrlParams";

interface PlaylistRow { slug: string; title: string; owner: string; description: string | null }
interface CommunityAlbumRow { slug: string; title: string; composer: string; coverArtUrl: string | null; owner: { username: string } }
interface AlbumLite { slug: string; title: string; composer?: string | null; coverArtUrl: string | null; trackCount?: number }

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

let queueToken = 0; // bumped whenever an album is started, so a slower earlier one never adds its albums after a later choice

function BranchRow({ b, open, onToggle, playing }: { b: HomeBranch; open: boolean; onToggle: () => void; playing: boolean }) {
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const openChat = useChatDockStore((s) => s.openChat);
  const play = useAudioStore((s) => s.play);
  const addToQueue = useAudioStore((s) => s.addToQueue);
  const clearQueue = useAudioStore((s) => s.clearQueue);
  const audioPlaying = useAudioStore((s) => s.isPlaying);
  const nowBranch = useAudioStore((s) => s.currentTrack?.branchSlug ?? null);
  const nowAlbum = useAudioStore((s) => s.currentTrack?.albumSlug ?? null);
  const toggleAudio = useAudioStore((s) => s.toggle);
  const branchOn = audioPlaying && nowBranch === b.slug;
  const [albums, setAlbums] = useState<AlbumLite[] | null>(null);
  const [pictures, setPictures] = useState<BranchPicture[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const idn = identityOf({ slug: b.slug, color: b.color, glyph: b.glyph, seed: b.seed });

  useEffect(() => { // everything about a branch is fetched the first time its row is opened, not for every row up front
    if (!open || albums) return;
    api<AlbumLite[]>(`/api/branches/${b.slug}/albums`).then(setAlbums).catch(() => setAlbums([]));
    api<BranchPicture[]>(`/api/branches/${b.slug}/images`).then(setPictures).catch(() => setPictures([]));
  }, [open, albums, b.slug]);

  const discuss = () => { if (!b.chatSlug) return; if (isDesktop) openChat(b.chatSlug, b.name, b.slug); else navigate(`/branch/${b.slug}`); }; // a phone has no dock: the branch page is where its chat lives
  async function start(key: string, url: string, pick: (r: unknown) => PlayableTrackDTO[]) {
    if (busy) return;
    queueToken++; // whatever album was lining up its neighbours is no longer the plan
    setBusy(key);
    try {
      const tracks = pick(await api<unknown>(url));
      if (tracks.length === 0) return;
      clearQueue();
      const [first, ...rest] = tracks;
      play(first);
      addToQueue(rest);
    } finally { setBusy(null); }
  }
  const shuffle = () => (nowBranch === b.slug ? toggleAudio() : start("shuffle", `/api/branches/${b.slug}/tracks/shuffle`, (r) => r as PlayableTrackDTO[]));
  // Playing an album also lines up the branch's other albums behind it (the ones after it first, then the ones before), so the music carries on in context.
  const playAlbum = async (slug: string) => {
    if (nowAlbum === slug) { toggleAudio(); return; } // already the loaded album: pause / resume
    await start(slug, `/api/albums/${slug}`, (r) => (r as { tracks: PlayableTrackDTO[] }).tracks);
    const list = albums ?? [];
    const at = list.findIndex((a) => a.slug === slug);
    const others = [...list.slice(at + 1), ...list.slice(0, Math.max(0, at))].filter((a) => (a.trackCount ?? 0) > 0);
    const token = ++queueToken;
    for (const a of others) {
      try {
        const detail = await api<{ tracks: PlayableTrackDTO[] }>(`/api/albums/${a.slug}`);
        if (token !== queueToken || useAudioStore.getState().currentTrack?.branchSlug !== b.slug) return; // something else was started meanwhile
        useAudioStore.getState().addToQueue(detail.tracks);
      } catch { /* an album that can't be fetched is simply left out */ }
    }
  };

  // Pictures not already shown another way: album covers are in the album list, the main image is the logo, the secondary one is a background.
  const gallery = (pictures ?? []).filter((p) => p.kind !== "album-cover" && p.url !== b.image && p.url !== b.secondaryImage).slice(0, 3);
  return (
    <li draggable onDragStart={(e) => dragPayload(e, b.name, branchHref(b.slug))} className={`sb-row${open ? " open" : ""}${b.seed ? " seed" : ""}${playing ? " playing" : ""}`} style={{ ["--emb" as string]: idn.color }} data-slug={b.slug} data-testid="branch-row">
      <div className="sb-row-main">
        {/* The whole row is the toggle: a real button under the text and links, so a click anywhere that isn't a link or button opens the branch. */}
        <button type="button" className="sb-toggle" aria-expanded={open} aria-controls={`sb-prev-${b.slug}`} aria-label={`${open ? "Collapse" : "Expand"} ${b.name}`} onClick={onToggle} data-testid="preview-toggle" />
        <BranchEmblem glyph={idn.glyph} color={idn.color} size={40} imageUrl={b.image} />
        <div className="sb-row-text">
          <h3 className="sb-row-name">
            <span>{b.name}</span>
            {b.seed && <span className="home-chip">Growing seed</span>}
            {playing && <span className="sb-playing" data-testid="now-playing"><i /><i /><i />Playing now</span>}
          </h3>
          <p className="sb-row-blurb">{b.blurb || "No description yet."}</p>
          <p className="sb-row-meta">{b.albums} album{b.albums === 1 ? "" : "s"} · {b.tracks} track{b.tracks === 1 ? "" : "s"}<span className="sb-active">{b.lastActiveAt ? ` · active ${timeAgo(b.lastActiveAt)}` : " · no activity yet"}</span></p>
        </div>
        <div className="sb-actions">
          {/* No albums: nothing to play, so no button. Open with albums: the albums below are the way in, so the shuffle fades out (and comes back when closed). */}
          {b.albums > 0 && <PlayGlow when="hover" hostSelector=".sb-row" active={!open}><button type="button" className={`sb-act sb-play${open ? " sb-play-faded" : ""}`} onClick={shuffle} disabled={busy !== null || b.tracks === 0} tabIndex={open ? -1 : undefined} aria-hidden={open ? true : undefined} aria-label={branchOn ? `Pause ${b.name}` : `Play a shuffle of ${b.name}`} title={branchOn ? "Pause" : "Play shuffle"} data-testid="row-play">{branchOn ? <PauseIcon size={13} /> : <PlayIcon size={13} />}</button></PlayGlow>}
          {b.chatSlug && <button type="button" className="sb-act sb-extra" onClick={discuss} data-testid="row-discuss"><ChatIcon size={13} /> Discussion</button>}
          <Link className="sb-act sb-extra" to={`/?branch=${b.slug}`} data-testid="row-map"><MapIcon size={13} /> Map</Link>
        </div>
      </div>
      {open && (
        <div className="sb-preview" id={`sb-prev-${b.slug}`} data-testid="branch-preview">
          <div className="sb-prev-body">
            {b.details && <p className="sb-prev-details" data-testid="branch-details">{b.details}</p>}
            <p className="sb-prev-label">Albums</p>
            {albums === null ? <p className="home-dim">Loading albums…</p> : albums.length === 0 ? <p className="home-dim">No albums yet.</p> : (
              <ul className="sb-albums" data-testid="branch-albums">
                {albums.map((a) => (
                  <li key={a.slug} className="sb-album" data-slug={a.slug}>
                    <Link className="sb-album-cover" to={`/album/${a.slug}`} aria-label={`${a.title}: open the album`}>
                      {a.coverArtUrl ? <img src={a.coverArtUrl} alt="" loading="lazy" /> : <span className="sb-album-nocover" aria-hidden="true" />}
                      <span className="pic-album-icon" data-testid="album-icon"><AlbumIcon size={13} /></span>
                    </Link>
                    <span className="sb-album-info">
                      <Link to={`/album/${a.slug}`}>{a.title}</Link>
                      <span className="home-dim">{a.trackCount ?? 0} track{a.trackCount === 1 ? "" : "s"}{a.composer ? ` · ${a.composer}` : ""}</span>
                    </span>
                    <button type="button" className="btn icon-btn sb-album-play" onClick={() => playAlbum(a.slug)} disabled={busy !== null || !a.trackCount} aria-label={audioPlaying && nowAlbum === a.slug ? `Pause ${a.title}` : `Play ${a.title}`} title={audioPlaying && nowAlbum === a.slug ? "Pause" : `Play ${a.title}`} data-testid="album-play">{audioPlaying && nowAlbum === a.slug ? <PauseIcon size={15} /> : <PlayIcon size={15} />}</button>
                  </li>
                ))}
              </ul>
            )}
            <BranchStudies studies={b.studies ?? []} />
          </div>
          {gallery.length > 0 && (
            <ul className="sb-gallery" aria-label={`Pictures from ${b.name}`} data-testid="branch-gallery">
              {gallery.map((g) => <li key={g.url}>{g.albumSlug ? <Link to={`/album/${g.albumSlug}`} title={g.label}><img src={g.url} alt={g.label} loading="lazy" /></Link> : <img src={g.url} alt={g.label} loading="lazy" />}</li>)}
            </ul>
          )}
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

  useEffect(() => {
    let alive = true;
    api<PlaylistRow[]>("/api/playlists").then((p) => alive && setPlaylists(p)).catch(() => alive && setPlaylists([]));
    api<CommunityAlbumRow[]>("/api/community-albums").then((a) => alive && setAlbums(a)).catch(() => alive && setAlbums([]));
    return () => { alive = false; };
  }, []);

  const filter: BranchFilterKey = params.get("show") === "all" ? "all" : "albums"; // "Has albums" is the default; "All" shows branches that have none yet too
  // Which branches are expanded lives in the address (open=a,b,c), so any view can be linked, and a link can open several at once.
  const openRaw = params.get("open");
  const openList = useMemo(() => parseOpenList(openRaw), [openRaw]);
  const openSlugs = useMemo(() => new Set(openList), [openList]);
  const sortParam = params.get("sort");
  const sort: SoundbaySort = sortParam === "az" ? "az" : sortParam === "active" ? "active" : "tracks"; // Tracks is the default
  const query = params.get("q") ?? "";

  const all = home?.branches ?? [];
  const nowSlug = useAudioStore((s) => s.currentTrack?.branchSlug ?? null);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const playingSlug = isPlaying ? nowSlug : null; // while a branch is playing, it moves to the top of its list and is marked
  const forcedKey = openList.join(","); // branches that were linked to are shown whatever the filter says
  const forcedList = useMemo(() => openList.map((sl) => all.find((b) => b.slug === sl)).filter((b): b is HomeBranch => !!b), [all, forcedKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const withForced = (rows: HomeBranch[], seed: boolean) => {
    const missing = forcedList.filter((f) => f.seed === seed && !rows.some((r) => r.slug === f.slug));
    return missing.length ? [...missing, ...rows] : rows;
  };
  const grown = useMemo(() => pinPlaying(withForced(sortBranches(filterBranches(all.filter((b) => !b.seed), filter, query), sort), false), playingSlug), [all, filter, query, sort, playingSlug, forcedList]); // eslint-disable-line react-hooks/exhaustive-deps
  const seeds = useMemo(() => pinPlaying(withForced(sortBranches(filterBranches(all.filter((b) => b.seed), filter, query), sort), true), playingSlug), [all, filter, query, sort, playingSlug, forcedList]); // eslint-disable-line react-hooks/exhaustive-deps
  const lists = useMemo(() => sortSimple(filterSimple(playlists ?? [], query, (p) => `${p.title} ${p.owner} ${p.description ?? ""}`), sort, (p) => p.title), [playlists, query, sort]);
  const albs = useMemo(() => sortSimple(filterSimple(albums ?? [], query, (a) => `${a.title} ${a.composer} ${a.owner.username}`), sort, (a) => a.title), [albums, query, sort]);
  const counts: Record<SectionId, number> = { "sb-branches": grown.length, "sb-seeds": seeds.length, "sb-playlists": lists.length, "sb-albums": albs.length };
  const totalShown = counts["sb-branches"] + counts["sb-seeds"] + counts["sb-playlists"] + counts["sb-albums"];
  const ready = !!home && playlists !== null && albums !== null;
  const searching = query.trim() !== "" || filter !== "albums";
  const current = useCurrentSection(SECTIONS.map((s) => s.id));
  const toggle = (slug: string) => { // built from the address as it is right now, so two quick clicks never undo each other
    const cur = parseOpenList(new URLSearchParams(window.location.search).get("open"));
    setParam("open", openListParam(cur.includes(slug) ? cur.filter((x) => x !== slug) : [...cur, slug]), "");
  };
  // A branch that starts playing moves to the top of its list; if it is open, the page follows it up there (not when it is merely resumed).
  const lastPlayingRef = useRef<string | null>(null);
  useEffect(() => {
    if (!playingSlug || playingSlug === lastPlayingRef.current) return;
    lastPlayingRef.current = playingSlug;
    if (!openSlugs.has(playingSlug)) return;
    const slug = playingSlug.replace(/["\\]/g, "");
    const id = window.setTimeout(() => document.querySelector(`.sb-row[data-slug="${slug}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" }), 120);
    return () => window.clearTimeout(id);
  }, [playingSlug]); // eslint-disable-line react-hooks/exhaustive-deps

  const scrolledToOpen = useRef(false);
  useEffect(() => { // arriving with open=...: bring the first of those branches into view (once it is really on the page)
    if (!home || scrolledToOpen.current || forcedList.length === 0) return;
    const slug = forcedList[0].slug.replace(/["\\]/g, "");
    let tries = 0;
    const id = window.setInterval(() => {
      const row = document.querySelector(`.sb-row[data-slug="${slug}"]`);
      if (row) { scrolledToOpen.current = true; row.scrollIntoView({ block: "start", behavior: "smooth" }); window.clearInterval(id); }
      else if (++tries > 20) window.clearInterval(id);
    }, 100);
    return () => window.clearInterval(id); // a re-render just starts the search again: it only stops for good once the row has been scrolled to
  }, [home, forcedList]);

  // album=slug&play=1[&track=..&t=..]: a link that starts an album (or a song in it, from a moment). The album is fetched only for such a link.
  const albumSlug = params.get("album");
  const autoplayRequest = parseAutoplay(params);
  const [linkedAlbum, setLinkedAlbum] = useState<{ tracks: PlayableTrackDTO[] } | null>(null);
  useEffect(() => {
    if (!albumSlug || !autoplayRequest.play) return;
    let alive = true;
    api<{ tracks: PlayableTrackDTO[] }>(`/api/albums/${encodeURIComponent(albumSlug)}`).then((a) => alive && setLinkedAlbum(a)).catch(() => {});
    return () => { alive = false; };
  }, [albumSlug, autoplayRequest.play]);
  const clearQueue = useAudioStore((s) => s.clearQueue);
  const playAt = useAudioStore((s) => s.playAt);
  function copyLink() {
    navigator.clipboard?.writeText(window.location.href).then(
      () => useToastStore.getState().showToast("Link copied ✓"),
      () => useToastStore.getState().showToast("Couldn't copy: copy the address from the address bar"),
    );
  }
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
  const desktopPage = useIsDesktop();
  const actions = (
        <div className="sb-head-actions">
          <button type="button" className="btn icon-btn title-btn" onClick={copyLink} aria-label="Copy a link to this view" title="Copy a link to this view: the branches that are open, the search and the filter are all in it" data-testid="copy-link">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.7-1.7" /></svg>
          </button>
          <PlayGlow active={!isPlaying}><button type="button" className="btn btn-primary icon-btn title-btn" onClick={shuffleAll} disabled={busy} aria-label="Shuffle everything" title="Shuffle everything" data-testid="shuffle-all"><PlayIcon size={18} /></button></PlayGlow>
          {MAP_VIEW_ENABLED && <Link className="btn title-btn" to="/?map=full" data-testid="open-map"><MapIcon size={15} /> Explore the map</Link>}
        </div>
  );  const branchSection = (id: SectionId, title: string, rows: HomeBranch[]) => rows.length > 0 && (
    <section id={id} className="sb-section" aria-labelledby={`${id}-h`}>
      <div className="home-h2-row"><h2 id={`${id}-h`} className="home-h2">{title} <span className="home-dim sb-count">{rows.length}</span></h2>{!desktopPage && id === (grown.length ? "sb-branches" : "sb-seeds") && <div className="sb-h2-actions">{actions}</div> /* on a phone the copy-link and shuffle buttons sit at the right of the first section's heading */}</div>
      <ul className="sb-list">{rows.map((b) => <BranchRow key={b.slug} b={b} open={openSlugs.has(b.slug)} onToggle={() => toggle(b.slug)} playing={b.slug === playingSlug} />)}</ul>
    </section>
  );



  return (
    <div className="home-page space-page" data-testid="soundbay-page">
      <header className="home-hero sb-head">
        <h1>Soundbay</h1>
        {desktopPage && actions}
      </header>

      <div className="sb-toolbar" data-testid="sb-toolbar">
        <div className="space-controls">
          <input type="search" className="space-search" placeholder="Search" aria-label="Search Soundbay" value={query} onChange={(e) => setParam("q", e.target.value, "")} data-testid="sb-search" />
          <div className="space-chips" role="group" aria-label="Show branches">
            {(["albums", "all"] as BranchFilterKey[]).map((k) => <button key={k} type="button" className="space-chip" aria-pressed={filter === k} onClick={() => setParam("show", k, "albums")} data-testid={`sb-filter-${k}`}>{FILTER_LABEL[k]}</button>)}
          </div>
          <label className="space-sort"><span className="home-dim">Sort</span>
            <select value={sort} onChange={(e) => setParam("sort", e.target.value, "tracks")} aria-label="Sort Soundbay" data-testid="sb-sort">
              {(Object.keys(SORT_LABEL) as SoundbaySort[]).map((k) => <option key={k} value={k}>{SORT_LABEL[k]}</option>)}
            </select></label>
        </div>
        <div className="sb-jumprow">
          <nav className="sb-jump" aria-label="Sections">
            {SECTIONS.map((s) => <button key={s.id} type="button" className="sb-jump-btn" aria-current={current === s.id ? "location" : undefined} onClick={() => jump(s.id)} disabled={counts[s.id] === 0} data-testid={`jump-${s.id}`}>{s.label} <span className="space-chip-n">{ready ? counts[s.id] : "…"}</span></button>)}
          </nav>
        </div>
      </div>

      {!ready && <div className="home-placeholder" aria-busy={!failed}>{failed ? "Couldn't load the branches. Reload to try again." : "Loading…"}</div>}
      {ready && totalShown === 0 && (
        <p className="home-dim" data-testid="sb-empty">Nothing matches{query ? ` "${query}"` : ""}. <button type="button" className="sb-clear" onClick={() => { setParam("q", "", ""); setParam("show", "albums", "albums"); }}>Clear the search and filter</button></p>
      )}
      {ready && (
        <>
          {branchSection("sb-branches", "Branches", grown)}
          {branchSection("sb-seeds", "Growing seeds", seeds)}
          {lists.length > 0 && (
            <section id="sb-playlists" className="sb-section" aria-labelledby="sb-playlists-h">
              <div className="home-h2-row"><h2 id="sb-playlists-h" className="home-h2">Playlists <span className="home-dim sb-count">{lists.length}</span></h2><span className="home-dim">made by members</span></div>
              <ul className="sb-simple" data-testid="playlist-list">{lists.map((p) => <li key={p.slug}><Link to={`/playlist/${p.slug}`}><b>{p.title}</b></Link><span className="home-dim"> by <Username name={p.owner} />{p.description ? ` · ${p.description}` : ""}</span></li>)}</ul>
            </section>
          )}
          {albs.length > 0 && (
            <section id="sb-albums" className="sb-section" aria-labelledby="sb-albums-h">
              <div className="home-h2-row"><h2 id="sb-albums-h" className="home-h2">Community albums <span className="home-dim sb-count">{albs.length}</span></h2><span className="home-dim">from members</span></div>
              <ul className="sb-simple" data-testid="album-list">{albs.map((a) => <li key={a.slug}><Link to={`/community-album/${a.slug}`}><b>{a.title}</b></Link><span className="home-dim"> {a.composer || <Username name={a.owner.username} />}</span></li>)}</ul>
            </section>
          )}
          {searching && totalShown > 0 && <p className="home-dim sb-found">{totalShown} result{totalShown === 1 ? "" : "s"}</p>}
        </>
      )}
      {linkedAlbum && (
        <ShareAutoplay
          ready
          tracks={linkedAlbum.tracks.map((t) => ({ id: t.id, source: t.source, title: t.title, composer: t.composer }))}
          request={autoplayRequest}
          start={(index, t) => {
            const [first, ...rest] = linkedAlbum.tracks.slice(index);
            if (!first) return;
            playAt(first, t);
            clearQueue();
            useAudioStore.getState().addToQueue(rest);
            useAudioStore.getState().setCurrentPlaylist(null);
          }}
        />
      )}
    </div>
  );
}
