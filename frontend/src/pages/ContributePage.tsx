import { branchHref } from "../lib/branchLinks";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { PauseIcon, PlayIcon } from "../components/Icons";
import { useAudioStore } from "../lib/audioStore";
import type { PlayableTrackDTO } from "../lib/types";
import { filterBranches, sortBranches, STATE_LABEL, type ContributeBranch, type ContributeSample, type SubmissionStateKey } from "../lib/contribute";
import { renderMarkdown } from "../lib/markdown";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { useIsDesktop } from "../lib/useIsDesktop";
import { useUrlParams } from "../lib/useUrlParams";

interface BranchDetail { briefMarkdown: string | null }

/** A stable negative id for a chat file, so it can never be mistaken for a track of an album. */
function fileId(url: string): number {
  let h = 0;
  for (let i = 0; i < url.length; i++) h = (Math.imul(h, 31) + url.charCodeAt(i)) | 0;
  return -(Math.abs(h) + 1);
}

/** The branch's sample: one Play button (no browser player). A track of the site plays as itself; a chat file plays with a link back to its message. */
function SamplePlay({ sample, branchSlug }: { sample: ContributeSample; branchSlug: string }) {
  const cur = useAudioStore((s) => s.currentTrack);
  const playing = useAudioStore((s) => s.isPlaying);
  const play = useAudioStore((s) => s.play);
  const toggle = useAudioStore((s) => s.toggle);
  const clearQueue = useAudioStore((s) => s.clearQueue);
  const setCurrentPlaylist = useAudioStore((s) => s.setCurrentPlaylist);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const on = !!cur && (sample.kind === "track" ? cur.id === sample.trackId && cur.source === sample.source : cur.fileUrl === sample.url);

  async function press() {
    if (on) { toggle(); return; }
    setBusy(true); setFailed(false);
    try {
      let track: PlayableTrackDTO | undefined;
      if (sample.kind === "track") {
        const path = sample.source === "community" ? `/api/community-albums/${encodeURIComponent(sample.albumSlug)}` : `/api/albums/${encodeURIComponent(sample.albumSlug)}`;
        const album = await api<{ tracks: PlayableTrackDTO[] }>(path);
        track = album.tracks.find((t) => t.id === sample.trackId);
      } else {
        track = {
          id: fileId(sample.url), title: sample.title, fileUrl: sample.url, format: "MP3", durationSeconds: null, position: 0,
          albumTitle: "", albumSlug: "", coverArtUrl: null, composer: "", branchSlug, bookmarks: [], replayGainDb: null, source: "official", genres: [], origin: sample.origin,
        };
      }
      if (!track) { setFailed(true); return; }
      clearQueue(); setCurrentPlaylist(null); play(track);
    } catch { setFailed(true); } finally { setBusy(false); }
  }
  const label = sample.kind === "track" ? sample.title : sample.title;
  const sub = sample.kind === "track" ? sample.detail : sample.origin ? `from ${sample.origin.label}` : "";
  return (
    <button type="button" className="ct2-play" onClick={press} disabled={busy} aria-label={on && playing ? `Pause ${label}` : `Play ${label}`} data-testid="sample-play">
      <span className="ct2-play-icon">{on && playing ? <PauseIcon size={15} /> : <PlayIcon size={15} />}</span>
      <span className="ct2-play-text"><b>{failed ? "Couldn't play it" : label}</b>{sub && <small>{sub}</small>}</span>
    </button>
  );
}
const STEPS = ["Pick a branch", "Make a piece", "Submit · the team listens"];
const SEARCH_FROM = 8; // a search box only earns its place once the list is long

/** The one thing to do next for a branch, in as few words as possible. */
function nextAction(loggedIn: boolean, b: ContributeBranch): { head: string; sub?: string; label: string; to: string; primary: boolean } {
  const order: SubmissionStateKey[] = ["started", "waiting", "approved", "not-accepted"];
  const first = order.map((st) => b.mySubmissions.find((x) => x.state === st)).find(Boolean);
  const submit = `/submit?branch=${b.slug}`;
  if (!loggedIn) return { head: "Log in to submit", label: "Log in", to: "/login", primary: true };
  if (!first) return { head: "Make something for this branch", label: "Submit work", to: submit, primary: true };
  if (first.state === "started") return { head: `Finish “${first.title}”`, label: "Add your tracks", to: `${submit}&album=${first.slug}`, primary: true };
  if (first.state === "waiting") return { head: "Waiting for review", sub: "The team replies in the discussion.", label: "Open your submission", to: `/community-album/${first.slug}`, primary: false };
  if (first.state === "approved") return { head: "Approved", label: "Send another", to: submit, primary: false };
  return { head: "Not accepted this time", label: "Send a new piece", to: submit, primary: false };
}

export function ContributePage({ embedded = false }: { embedded?: boolean } = {}) {
  useDocumentTitle(embedded ? "XenoLab" : "Contribute");
  const { user } = useAuth();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const [branches, setBranches] = useState<ContributeBranch[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [params, setParam] = useUrlParams();
  const [briefOpen, setBriefOpen] = useState(false);
  const [briefs, setBriefs] = useState<Record<string, string | null>>({});
  const panelRef = useRef<HTMLDivElement>(null);
  const justChose = useRef(false); // true only after the person picked a branch, so opening a linked address doesn't steal focus

  useEffect(() => { api<ContributeBranch[]>("/api/contribute/branches").then((b) => setBranches(b.map((x) => ({ ...x, mySubmissions: x.mySubmissions ?? [] })))).catch(() => setFailed(true)); }, [user?.username]);

  const query = params.get("q") ?? "";
  const shown = useMemo(() => sortBranches(filterBranches(branches ?? [], "all", query), "az"), [branches, query]);
  const selectedSlug = params.get("branch");
  const selected = branches?.find((b) => b.slug === selectedSlug) ?? null;

  useEffect(() => { // the brief is fetched only when someone opens it
    if (!selected || !briefOpen || selected.slug in briefs || !selected.hasBrief) return;
    api<BranchDetail>(`/api/contribute/branches/${selected.slug}`).then((d) => setBriefs((m) => ({ ...m, [selected.slug]: d.briefMarkdown }))).catch(() => setBriefs((m) => ({ ...m, [selected.slug]: null })));
  }, [selected, briefOpen, briefs]);

  function choose(slug: string) {
    justChose.current = true;
    setParam("branch", slug, "");
    setBriefOpen(false);
  }
  // Once the panel for the chosen branch is really on the page, move focus to it and bring it into view.
  useEffect(() => {
    if (!selected || !justChose.current) return;
    justChose.current = false;
    const el = panelRef.current;
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ block: isDesktop ? "nearest" : "start", behavior: "smooth" });
  }, [selected?.slug]); // eslint-disable-line react-hooks/exhaustive-deps

  const stepNow = !selected ? 0 : selected.mySubmissions.length > 0 ? 2 : 1;

  const panel = selected && (() => {
    const next = nextAction(!!user, selected);
    const blurb = selected.description;
    return (
      <div className={`ct-panel${selected.secondaryImage ? " has-bg" : ""}`} ref={panelRef} tabIndex={-1} aria-label={`About ${selected.name}`} data-testid="contribute-panel">
        {selected.secondaryImage && <img className="ct2-bg" style={selected.bgOpacity != null ? { ["--bgo" as string]: selected.bgOpacity } : undefined} src={selected.secondaryImage} alt="" loading="lazy" decoding="async" draggable={false} />}
        <h2 className="ct-panel-title">{selected.name}</h2>
        {blurb && <p className="ct2-blurb">{blurb}</p>}

        <div className="ct2-tiles">
          <div className={`ct2-tile${selected.hasBrief ? "" : " off"}`} data-testid="tile-brief">
            <span className="ct2-tile-h">Brief</span>
            {selected.hasBrief ? (
              <span className="ct2-tile-actions">
                <button type="button" className="btn" aria-expanded={briefOpen} onClick={() => setBriefOpen((o) => !o)}>{briefOpen ? "Hide" : "Read"}</button>
                <a className="btn" href={`/api/contribute/branches/${selected.slug}/brief`} aria-label="Download the brief">Download</a>
              </span>
            ) : <span className="ct2-none">none yet</span>}
          </div>
          <div className={`ct2-tile${selected.previewUrl ? "" : " off"}`} data-testid="tile-sample">
            <span className="ct2-tile-h">Sample</span>
            {selected.sample ? <SamplePlay sample={selected.sample} branchSlug={selected.slug} /> : selected.previewUrl ? <SamplePlay sample={{ kind: "attachment", url: selected.previewUrl, title: "Sample", origin: null }} branchSlug={selected.slug} /> : <span className="ct2-none">none yet</span>}
          </div>
          <div className={`ct2-tile${selected.sketchCount > 0 ? "" : " off"}`} data-testid="tile-sketches">
            <span className="ct2-tile-h">Sketches</span>
            {selected.sketchCount > 0 ? <a className="btn" href={`/api/contribute/branches/${selected.slug}/sketches.zip`}>Download · {selected.sketchCount}</a> : <span className="ct2-none">none yet</span>}
          </div>
        </div>

        {briefOpen && selected.hasBrief && (
          <div className="ct-brief" data-testid="contribute-brief">
            {briefs[selected.slug] === undefined ? <p className="home-dim">Loading…</p> : briefs[selected.slug] ? renderMarkdown(briefs[selected.slug]!, navigate) : <p className="home-dim">Couldn't load it. Download it instead.</p>}
          </div>
        )}

        <div className="ct2-next" role="status" data-testid="contribute-next">
          <div>
            <b>{next.head}</b>
            {next.sub && <span className="home-dim"> {next.sub}</span>}
          </div>
          <Link className={`btn${next.primary ? " btn-primary" : ""}`} to={next.to} data-testid={next.primary && user ? "submit-work" : undefined}>{next.label}</Link>
        </div>

        {selected.mySubmissions.length > 0 && (
          <ul className="ct-mine" aria-label="Your submissions here">
            {selected.mySubmissions.map((x) => <li key={x.slug}><Link to={`/community-album/${x.slug}`}>{x.title}</Link> <span className={`ct-state ct-state-${x.state}`}>{STATE_LABEL[x.state]}</span></li>)}
          </ul>
        )}
        <p className="ct2-more"><Link to={branchHref(selected.slug)}>Open the branch</Link></p>
      </div>
    );
  })();

  return (
    <div className="page-column" style={{ maxWidth: 1000 }} data-testid="contribute-page">
      {!embedded && <h1>Contribute</h1>}
      <ol className="ct2-steps" aria-label="How contributing works">
        {STEPS.map((t, i) => <li key={t} className={i === stepNow ? "now" : i < stepNow ? "done" : ""} aria-current={i === stepNow ? "step" : undefined}><i>{i + 1}</i>{t}</li>)}
      </ol>

      <div className={`ct-layout${selected ? " has-selection" : ""}`}>
        <section aria-label="Branches" className="ct-list-wrap">
          {(branches?.length ?? 0) >= SEARCH_FROM && (
            <input type="search" className="space-search" placeholder="Search branches" aria-label="Search branches" value={query} onChange={(e) => setParam("q", e.target.value, "")} data-testid="contribute-search" />
          )}
          {!branches ? <p className="home-dim" aria-busy={!failed}>{failed ? "Couldn't load the branches. Reload to try again." : "Loading…"}</p>
            : shown.length === 0 ? <p className="home-dim" data-testid="contribute-empty">{branches.length === 0 ? "No branches are open yet." : "No branch matches."}</p>
            : (
              <ul className="ct-list" data-testid="contribute-list">
                {shown.map((b) => {
                  const on = b.slug === selected?.slug;
                  const latest = b.mySubmissions[0];
                  return (
                    <li key={b.slug} className={on ? "on" : ""}>
                      <button type="button" className={`ct-row ct2-row${b.image ? " has-bg" : ""}`} aria-pressed={on} aria-controls="ct-detail" onClick={() => choose(b.slug)} data-slug={b.slug}>
                        {b.image && <img className="ct2-bg" style={b.bgOpacity != null ? { ["--bgo" as string]: b.bgOpacity } : undefined} src={b.image} alt="" loading="lazy" decoding="async" draggable={false} />}
                        <span className="ct-row-name">{b.name}{b.seed && <small className="ct-seedtag">growing seed</small>}</span>
                        <span className="ct2-dots" aria-label={[b.hasBrief && "has a brief", b.previewUrl && "has a sample", b.sketchCount > 0 && "has sketches"].filter(Boolean).join(", ") || "nothing to start from yet"}>
                          <i className={b.hasBrief ? "on" : ""} title="Brief" /><i className={b.previewUrl ? "on" : ""} title="Sample" /><i className={b.sketchCount > 0 ? "on" : ""} title="Sketches" />
                        </span>
                        {latest && <span className={`ct-badge ct-state-${latest.state}`}>{STATE_LABEL[latest.state]}</span>}
                      </button>
                      {!isDesktop && on && <div id="ct-detail">{panel}</div>}
                    </li>
                  );
                })}
              </ul>
            )}
        </section>
        {isDesktop && (
          <aside id="ct-detail" className="ct-detail" aria-live="polite">
            {panel ?? <p className="home-dim ct-hint" data-testid="contribute-hint">← Pick a branch</p>}
          </aside>
        )}
      </div>
    </div>
  );
}
