import { branchHref } from "../lib/branchLinks";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ContributeTimeline, type ContributeStepKey } from "../components/ContributeTimeline";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { filterBranches, nextStep, sortBranches, STATE_LABEL, type BranchFilter, type BranchSort, type ContributeBranch } from "../lib/contribute";
import { renderMarkdown } from "../lib/markdown";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { useIsDesktop } from "../lib/useIsDesktop";
import { useUrlParams } from "../lib/useUrlParams";

interface BranchDetail { briefMarkdown: string | null }
const FILTERS: { id: BranchFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "sample", label: "Has a sample" },
  { id: "sketches", label: "Has sketches" },
  { id: "brief", label: "Has a brief" },
  { id: "mine", label: "I've submitted" },
];
const SORTS: { id: BranchSort; label: string }[] = [{ id: "az", label: "A to Z" }, { id: "material", label: "Most to start from" }];

export function ContributePage({ embedded = false }: { embedded?: boolean } = {}) {
  useDocumentTitle(embedded ? "XenoLab" : "Contribute");
  const { user } = useAuth();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const [branches, setBranches] = useState<ContributeBranch[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [params, setParam] = useUrlParams();
  const [activeStep, setActiveStep] = useState<ContributeStepKey | null>(null);
  const [briefs, setBriefs] = useState<Record<string, string | null>>({});
  const panelRef = useRef<HTMLDivElement>(null);
  const justChose = useRef(false); // true only after the person picked a branch, so opening a linked address doesn't steal focus

  useEffect(() => { api<ContributeBranch[]>("/api/contribute/branches").then((b) => setBranches(b.map((x) => ({ ...x, mySubmissions: x.mySubmissions ?? [] })))).catch(() => setFailed(true)); }, [user?.username]);

  const filterParam = params.get("show");
  const filter: BranchFilter = FILTERS.some((f) => f.id === filterParam) ? (filterParam as BranchFilter) : "all";
  const sortParam = params.get("sort");
  const sort: BranchSort = sortParam === "material" ? "material" : "az";
  const query = params.get("q") ?? "";
  const shown = useMemo(() => sortBranches(filterBranches(branches ?? [], filter, query), sort), [branches, filter, query, sort]);
  const selectedSlug = params.get("branch");
  const selected = branches?.find((b) => b.slug === selectedSlug) ?? null;

  useEffect(() => { // the concept text is fetched when a branch is chosen, not for all of them up front
    if (!selected || selected.slug in briefs || !selected.hasBrief) return;
    api<BranchDetail>(`/api/contribute/branches/${selected.slug}`).then((d) => setBriefs((m) => ({ ...m, [selected.slug]: d.briefMarkdown }))).catch(() => setBriefs((m) => ({ ...m, [selected.slug]: null })));
  }, [selected, briefs]);

  function choose(slug: string) {
    justChose.current = true;
    setParam("branch", slug, "");
    setActiveStep(null);
  }
  // Once the panel for the chosen branch is really on the page, move focus to it and bring it into view.
  useEffect(() => {
    if (!selected || !justChose.current) return;
    justChose.current = false;
    const el = panelRef.current;
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ block: isDesktop ? "nearest" : "start", behavior: "smooth" });
  }, [selected?.slug]); // eslint-disable-line react-hooks/exhaustive-deps

  const mark = (step: ContributeStepKey) => (activeStep === step ? " ct-highlight" : "");

  const panel = selected && (
    <div className="ct-panel" ref={panelRef} tabIndex={-1} aria-label={`About ${selected.name}`} data-testid="contribute-panel">
      <h2 className="ct-panel-title">{selected.name}</h2>
      {(() => {
        const step = nextStep(!!user, selected);
        return (
          <div className={`ct-next ct-next-${step.stage}${mark("submit")}`} role="status" data-testid="contribute-next">
            <p className="ct-next-label">Next</p>
            <p className="ct-next-head">{step.headline}</p>
            <p className="home-dim ct-next-detail">{step.detail}</p>
            <div className="ct-actions">
              {step.stage === "login" && <Link className="btn btn-primary" to="/login">Log in to submit</Link>}
              {(step.stage === "prepare" || step.stage === "approved" || step.stage === "again") && <Link className="btn btn-primary" to={`/submit?branch=${selected.slug}`} data-testid="submit-work">Submit work</Link>}
              {step.submission && step.stage === "continue" && <Link className="btn btn-primary" to={`/submit?branch=${selected.slug}&album=${step.submission.slug}`} data-testid="continue-submission">Add your tracks</Link>}
              {step.submission && step.stage !== "continue" && <Link className="btn" to={`/community-album/${step.submission.slug}`}>Open your submission</Link>}
              {step.stage === "waiting" && <Link className="btn" to={`/submit?branch=${selected.slug}`}>Submit another piece</Link>}
            </div>
          </div>
        );
      })()}

      <section aria-labelledby="ct-concept"><h3 id="ct-concept" className={`ct-h3${mark("brief")}`}>The concept</h3>
        {selected.hasBrief && selected.description && <p className="ct-lede">{selected.description}</p>}
        {selected.hasBrief ? (briefs[selected.slug] === undefined ? <p className="home-dim">Loading the brief…</p> : briefs[selected.slug] ? <div className="ct-brief">{renderMarkdown(briefs[selected.slug]!, navigate)}</div> : <p className="home-dim">The brief couldn't be loaded. You can still download it.</p>)
          : <p className="home-dim">{selected.description || "There's no written brief for this branch yet. Listen to the sample and make something that fits."}</p>}
        {selected.hasBrief && <a className={`btn${mark("brief")}`} href={`/api/contribute/branches/${selected.slug}/brief`}>Download the brief</a>}
      </section>

      <section aria-labelledby="ct-sample"><h3 id="ct-sample" className="ct-h3">Hear a sample</h3>
        {selected.previewUrl ? <audio controls preload="none" src={selected.previewUrl} aria-label={`Sample from ${selected.name}`} style={{ width: "100%" }} /> : <p className="home-dim">No sample audio for this branch yet. <Link to={branchHref(selected.slug)}>Its albums</Link> are the best way to hear it.</p>}
      </section>

      <section aria-labelledby="ct-sketches"><h3 id="ct-sketches" className={`ct-h3${mark("sketches")}`}>Source material</h3>
        {selected.sketchCount > 0 ? <><p className="home-dim">{selected.sketchCount} curated sketch{selected.sketchCount === 1 ? "" : "es"} to start from, in one download.</p><a className={`btn${mark("sketches")}`} href={`/api/contribute/branches/${selected.slug}/sketches.zip`}>Download sketches ({selected.sketchCount})</a></>
          : <p className="home-dim">No sketches for this branch yet. You can start from the brief and the sample alone.</p>}
      </section>

      {selected.mySubmissions.length > 0 && (
        <section aria-labelledby="ct-mine"><h3 id="ct-mine" className={`ct-h3${mark("feedback")}`}>Your submissions here</h3>
          <ul className="ct-mine">{selected.mySubmissions.map((s) => <li key={s.slug}><Link to={`/community-album/${s.slug}`}>{s.title}</Link> <span className={`ct-state ct-state-${s.state}`}>{STATE_LABEL[s.state]}</span></li>)}</ul>
          <p className="home-dim ct-note">Review is done by people on the team. They reply in the submission's discussion. A submission only joins the branch if they approve it.</p>
        </section>
      )}

      <div className="ct-actions ct-panel-actions">
        <Link className={`btn${mark("official")}`} to={branchHref(selected.slug)}>View the branch</Link>
        <Link className="btn" to={`/conversations`}>Conversations</Link>
      </div>
    </div>
  );

  return (
    <div className="page-column" style={{ maxWidth: 1000 }} data-testid="contribute-page">
      {!embedded && <h1>Contribute</h1>}
      <p className="home-lede" style={{ marginBottom: "0.6rem" }}>Pick a branch, make something for it, and send it in. A person on the team listens and decides whether it joins the branch.</p>
      <ContributeTimeline activeStep={activeStep} onStepChange={setActiveStep} />

      <div className={`ct-layout${selected ? " has-selection" : ""}`}>
        <section aria-labelledby="ct-choose" className={`ct-list-wrap${mark("choose")}`}>
          <h2 id="ct-choose" className="ct-h2">1 · Choose a branch</h2>
          <div className="space-controls">
            <input type="search" className="space-search" placeholder="Search branches" aria-label="Search branches" value={query} onChange={(e) => setParam("q", e.target.value, "")} data-testid="contribute-search" />
            <label className="space-sort"><span className="home-dim">Sort</span>
              <select value={sort} onChange={(e) => setParam("sort", e.target.value, "az")} aria-label="Sort branches">{SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
          </div>
          <div className="space-chips" role="group" aria-label="Show branches that">
            {FILTERS.filter((f) => f.id !== "mine" || user).map((f) => <button key={f.id} type="button" className="space-chip" aria-pressed={filter === f.id} onClick={() => setParam("show", f.id, "all")}>{f.label}</button>)}
          </div>
          {!branches ? <p className="home-dim" aria-busy={!failed}>{failed ? "Couldn't load the branches. Reload to try again." : "Loading…"}</p>
            : shown.length === 0 ? <p className="home-dim" data-testid="contribute-empty">{branches.length === 0 ? "No branches are open for contributions yet." : "No branch matches. Try fewer words, or clear the filter."}</p>
            : (
              <ul className="ct-list" data-testid="contribute-list">
                {shown.map((b) => {
                  const on = b.slug === selected?.slug;
                  const latest = b.mySubmissions[0];
                  return (
                    <li key={b.slug} className={on ? "on" : ""}>
                      <button type="button" className="ct-row" aria-pressed={on} aria-controls="ct-detail" onClick={() => choose(b.slug)} data-slug={b.slug}>
                        <span className="ct-row-name">{b.name}</span>
                        {b.description && <span className="ct-row-desc">{b.description}</span>}
                        <span className="ct-badges">
                          {b.hasBrief && <span className="ct-badge">Brief</span>}
                          {b.previewUrl && <span className="ct-badge">Sample</span>}
                          {b.sketchCount > 0 && <span className="ct-badge">{b.sketchCount} sketch{b.sketchCount === 1 ? "" : "es"}</span>}
                          {latest && <span className={`ct-badge ct-state-${latest.state}`}>{STATE_LABEL[latest.state]}</span>}
                        </span>
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
            {panel ?? <p className="home-dim ct-hint" data-testid="contribute-hint">Choose a branch on the left to see its concept, hear a sample and get its source material. Nothing is sent until you submit.</p>}
          </aside>
        )}
      </div>
    </div>
  );
}
