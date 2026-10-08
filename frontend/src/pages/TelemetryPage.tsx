import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Username } from "../components/Username";
import { SignalBars } from "../components/SpaceGlyph";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { loadConversations, loadMembers, useLoaded } from "../lib/hubs";
import { useHome } from "../lib/home";
import { useLivePoll } from "../lib/livePoll";
import { usePresenceStore } from "../lib/presenceStore";
import { timeAgo } from "../lib/relativeTime";
import { normalizeConversations, SIGNAL_LABEL, sortConversations, type ConversationsData, type MembersData } from "../lib/spaceHubs";
import { loadPins, orderPanels, PANEL_IDS, savePins, togglePin, type PanelId } from "../lib/telemetryPins";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { useGuestOnline } from "../lib/useGuestOnline";
import { useOpenInDock } from "../lib/useOpenInDock";
import { studyToContinue, type StudyCard } from "../lib/xenolab";

interface ChallengeLite { id: number; title: string; active: boolean }

function Panel({ id, title, line, to, toLabel, pinned, onPin, preview, children, empty }: { id: PanelId; title: string; line: string; to: string; toLabel: string; pinned: boolean; onPin: (id: PanelId) => void; preview: ReactNode; children?: ReactNode; empty?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <section className={`tm-panel${pinned ? " tm-pinned" : ""}`} aria-labelledby={`tm-${id}-h`} data-testid={`tm-panel-${id}`}>
      <header className="tm-head">
        <div>
          <h2 id={`tm-${id}-h`} className="tm-title">{title}</h2>
          <p className="home-dim tm-line">{line}</p>
        </div>
        <div className="tm-tools">
          <button className="tm-pin" aria-pressed={pinned} aria-label={pinned ? `Unpin ${title}` : `Pin ${title} to the top`} title={pinned ? "Unpin" : "Pin to the top"} onClick={() => onPin(id)}>{pinned ? "★" : "☆"}</button>
          <Link className="btn" to={to}>{toLabel}</Link>
        </div>
      </header>
      <div className="tm-preview">{preview}</div>
      {children && !empty && (<>
        <button className="tm-more" aria-expanded={open} onClick={() => setOpen((v) => !v)} data-testid={`tm-toggle-${id}`}>{open ? "Show less" : "Show more"}</button>
        {open && <div className="tm-expanded">{children}</div>}
      </>)}
    </section>
  );
}

export function TelemetryPage() {
  useDocumentTitle("Telemetry");
  const { user } = useAuth();
  const { home } = useHome();
  const onOpen = useOpenInDock();
  const online = usePresenceStore((s) => s.onlineCount);
  useGuestOnline(!user);
  const { data: firstConv } = useLoaded(loadConversations);
  const { data: firstMembers } = useLoaded(loadMembers);
  const [conv, setConv] = useState<ConversationsData | null>(null);
  const [members, setMembers] = useState<MembersData | null>(null);
  const [studies, setStudies] = useState<StudyCard[]>([]);
  const [challenge, setChallenge] = useState<ChallengeLite | null>(null);
  const [pins, setPins] = useState<PanelId[]>(() => loadPins());

  useEffect(() => { if (firstConv) setConv(normalizeConversations(firstConv)); }, [firstConv]);
  useEffect(() => { if (firstMembers) setMembers(firstMembers); }, [firstMembers]);
  useEffect(() => {
    api<ChallengeLite[]>("/api/challenges").then((l) => setChallenge(l.find((c) => c.active) ?? null)).catch(() => {});
    if (user) api<StudyCard[]>("/api/studies").then(setStudies).catch(() => {});
  }, [user]);

  // live: only while this page is open, visible and the visitor is around (see livePoll)
  const refresh = useCallback(() => Promise.all([
    api<ConversationsData>("/api/conversations").then((d) => setConv(normalizeConversations(d))).catch(() => {}),
    api<MembersData>("/api/members").then(setMembers).catch(() => {}),
  ]), []);
  useLivePoll(refresh, true);

  const recent = useMemo(() => (conv ? sortConversations(conv.conversations, "recent").filter((c) => c.lastAt) : []), [conv]);
  const newest = useMemo(() => (members ? [...members.members].sort((a, b) => b.joinedAt - a.joinedAt) : []), [members]);
  const weekAgo = Date.now() - 7 * 86_400_000;
  const newThisWeek = newest.filter((m) => m.joinedAt > weekAgo).length;
  const cont = studyToContinue(studies, user?.username ?? null);
  const order = orderPanels(PANEL_IDS.filter((p) => p !== "messages" || !!user), pins);
  const pin = (id: PanelId) => setPins((p) => { const next = togglePin(p, id); savePins(next); return next; });

  // "For you": what is most worth a click right now
  const forYou: { key: string; tag: string; title: string; detail: string; to: string; chat?: { slug: string; name: string; branchSlug?: string | null } }[] = [];
  if (cont) forYou.push({ key: "study", tag: "Your study", title: cont.title, detail: `Edited ${timeAgo(Date.parse(cont.updatedAt))}`, to: `/study/${cont.slug}` });
  if (recent[0]) forYou.push({ key: "chat", tag: "Busiest right now", title: recent[0].name, detail: recent[0].lastText ? `${recent[0].lastBy}: ${recent[0].lastText}` : timeAgo(recent[0].lastAt!), to: recent[0].href, chat: { slug: recent[0].slug, name: recent[0].name, branchSlug: recent[0].branch?.slug } });
  if (challenge) forYou.push({ key: "challenge", tag: "Open challenge", title: challenge.title, detail: "Make something from it", to: "/xenolab?tab=challenges" });
  if (newest[0] && forYou.length < 3) forYou.push({ key: "member", tag: "New here", title: newest[0].username, detail: `Joined ${timeAgo(newest[0].joinedAt)}`, to: `/u/${encodeURIComponent(newest[0].username)}` });

  const panels: Record<PanelId, ReactNode> = {
    conversations: (
      <Panel key="conversations" id="conversations" title="Conversations" line="Every chat, and how alive it is" to="/conversations" toLabel="Open all" pinned={pins.includes("conversations")} onPin={pin} empty={recent.length <= 3}
        preview={recent.length === 0 ? <p className="home-dim">{conv ? "Nothing said yet." : "Loading…"}</p> : <ConvList items={recent.slice(0, 3)} onOpen={onOpen} />}>
        <ConvList items={recent.slice(3, 10)} onOpen={onOpen} />
        <p className="tm-links"><Link to="/conversations?view=map">Conversation map</Link><Link to="/conversations?view=list">List view</Link></p>
      </Panel>
    ),
    members: (
      <Panel key="members" id="members" title="Members" line={members ? `${members.count} aboard${newThisWeek ? `, ${newThisWeek} new this week` : ""}` : "Everyone aboard"} to="/members" toLabel="Open all" pinned={pins.includes("members")} onPin={pin} empty={newest.length <= 3}
        preview={newest.length === 0 ? <p className="home-dim">Loading…</p> : <MemberList items={newest.slice(0, 3)} />}>
        <MemberList items={newest.slice(3, 12)} />
      </Panel>
    ),
    messages: (
      <Panel key="messages" id="messages" title="Messages" line="Private conversations" to="/pms" toLabel="Open" pinned={pins.includes("messages")} onPin={pin} preview={<p className="home-dim">Only you and the people in them can see these.</p>} />
    ),
    contribute: (
      <Panel key="contribute" id="contribute" title="Contribute" line="Pick a branch project and add to it" to="/contribute" toLabel="Open" pinned={pins.includes("contribute")} onPin={pin} empty={!home || home.branches.length <= 4}
        preview={<ul className="tm-rows">{(home?.branches ?? []).slice(0, 4).map((b) => <li key={b.slug}><Link to="/contribute">{b.name}</Link> <span className="home-dim">{b.tracks} track{b.tracks === 1 ? "" : "s"}</span></li>)}{!home && <li className="home-dim">Loading…</li>}</ul>}>
        <ul className="tm-rows">{(home?.branches ?? []).slice(4, 12).map((b) => <li key={b.slug}><Link to="/contribute">{b.name}</Link> <span className="home-dim">{b.tracks} track{b.tracks === 1 ? "" : "s"}</span></li>)}</ul>
      </Panel>
    ),
    cult: (
      <Panel key="cult" id="cult" title="Cult activities" line="Community playlists and your own music" to="/cult" toLabel="Open" pinned={pins.includes("cult")} onPin={pin} preview={<p className="home-dim">Share music of your own, and listen to what others made.</p>} />
    ),
  };

  return (
    <div className="home-page tm-page" data-testid="telemetry-page">
      <header className="home-hero tm-hero">
        <h1>Telemetry</h1>
        <p className="tm-status" role="status" data-testid="tm-status">
          {online > 0 && <span><b>{online}</b> online</span>}
          {conv && <span><b>{conv.totals.activeChats}</b> chat{conv.totals.activeChats === 1 ? "" : "s"} active</span>}
          {conv && <span><b>{conv.totals.day}</b> signal{conv.totals.day === 1 ? "" : "s"} today</span>}
          {members && <span><b>{members.count}</b> members</span>}
        </p>
      </header>

      {forYou.length > 0 && (
        <section aria-labelledby="tm-fy">
          <h2 id="tm-fy" className="home-h2">{user ? "For you" : "Right now"}</h2>
          <div className="home-grid tm-fy">
            {forYou.slice(0, 3).map((f) => (
              <Link key={f.key} className="home-card" to={f.to} onClick={f.chat ? (e) => onOpen(e, f.chat!) : undefined}>
                <span className="home-card-tag">{f.tag}</span>
                <span className="home-card-title">{f.title}</span>
                <span className="home-dim home-card-meta tm-clip">{f.detail}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="tm-panels">{order.map((id) => panels[id])}</div>
      <p className="home-dim tm-note">Looking for samples or challenges? They moved to <Link to="/xenolab?tab=samples">XenoLab</Link>.</p>
    </div>
  );
}

function ConvList({ items, onOpen }: { items: ReturnType<typeof sortConversations>; onOpen: ReturnType<typeof useOpenInDock> }) {
  return (
    <ul className="tm-rows">
      {items.map((c) => (
        <li key={c.slug}>
          <SignalBars level={c.level} label={SIGNAL_LABEL[c.level]} />
          <Link to={c.href} onClick={(e) => onOpen(e, { slug: c.slug, name: c.name, branchSlug: c.branch?.slug })}><b>{c.name}</b></Link>
          <span className="home-dim tm-clip">{c.lastBy ? `${c.lastBy}: ` : ""}{c.lastText}</span>
          <span className="home-dim tm-when">{timeAgo(c.lastAt!)}</span>
        </li>
      ))}
    </ul>
  );
}

function MemberList({ items }: { items: MembersData["members"] }) {
  return (
    <ul className="tm-rows">
      {items.map((m) => (
        <li key={m.username}><Username name={m.username} /><span className="home-dim tm-clip">{m.bio}</span><span className="home-dim tm-when">{timeAgo(m.joinedAt)}</span></li>
      ))}
    </ul>
  );
}
