import { NavLink, Outlet, useLocation } from "react-router-dom";
import { AdminNavLink, useAttention } from "../../components/admin/Attention";
import { useEffect, useState } from "react";
import { api } from "../../lib/api";

export function AdminLayout() {
  const [pendingCount, setPendingCount] = useState(0);
  const att = useAttention(useLocation().pathname);

  useEffect(() => {
    function checkPending() {
      api<{ total?: number }>("/api/admin/inbox").then((d) => setPendingCount(typeof d?.total === "number" ? d.total : 0)).catch(() => undefined);
    }
    checkPending();
    const interval = setInterval(checkPending, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="admin-layout">
      <nav className="admin-nav">
        <NavLink to="/admin/attention" className={({ isActive }) => (isActive ? "active" : "")} style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }} data-testid="nav-attention">
          Needs attention
          {att.total > 0 && <span className="admin-light" data-kind="todo" data-testid="light-total">{att.total > 99 ? "99+" : att.total}</span>}
        </NavLink>
        <NavLink to="/admin/inbox" className={({ isActive }) => (isActive ? "active" : "")} style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
          Inbox
          {pendingCount > 0 && <span className="admin-nav-pending-dot" title={`${pendingCount} waiting`} />}
        </NavLink>
        <AdminNavLink to="join-requests" label="Join requests" att={att} />
        <AdminNavLink to="branches" label="Branches" att={att} />
        <AdminNavLink to="channels" label="Forum topics" att={att} />
        <AdminNavLink to="users" label="Users" att={att} />
        <AdminNavLink to="albums" label="Albums" att={att} />
        <AdminNavLink to="all-tracks" label="All Tracks" att={att} />
        <AdminNavLink to="studies" label="Studies" att={att} />
        <AdminNavLink to="resources" label="Resources" att={att} />
        <AdminNavLink to="glossary" label="Glossary" att={att} />
        <AdminNavLink to="lore" label="Room lore" att={att} />
        <AdminNavLink to="milestones" label="Milestones" att={att} />
        <AdminNavLink to="featured" label="Featured" att={att} />
        <AdminNavLink to="rewards" label="Rewards" att={att} />
        <AdminNavLink to="signal" label="Signal" att={att} />
        <AdminNavLink to="submissions" label="Submissions" att={att} />
        <AdminNavLink to="contributor-points" label="Contributor points" att={att} />
        <AdminNavLink to="wiki" label="Wiki" att={att} />
        <AdminNavLink to="blog" label="Blog" att={att} />
        <AdminNavLink to="emoji" label="Emoji" att={att} />
        <AdminNavLink to="email-templates" label="Email templates" att={att} />
        <AdminNavLink to="audit-log" label="Action log" att={att} />
        <AdminNavLink to="visor" label="Scan visor" att={att} />
        <AdminNavLink to="radio" label="Radio" att={att} />
        <AdminNavLink to="trash" label="Trash" att={att} />
        <AdminNavLink to="about" label="About page" att={att} />
        <AdminNavLink to="fonts" label="Fonts & Misc" att={att} />
        <AdminNavLink to="fx-settings" label="Spacemap field" att={att} />
        <NavLink to="/outreach" className={({ isActive }) => (isActive ? "active" : "")} style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }} title="Outreach lives outside the admin panel now: shareable with a password">
          Outreach ↗
        </NavLink>
        <AdminNavLink to="newsletter" label="Newsletter" att={att} />
        <AdminNavLink to="discord-import" label="Discord import" att={att} />
        <AdminNavLink to="storage" label="Storage" att={att} />
        <AdminNavLink to="discord-bridge" label="Discord bridge" att={att} />
        <AdminNavLink to="collaborators" label="Collaborators" att={att} />
        <AdminNavLink to="embeds" label="Favicon & Embeds" att={att} />
        <AdminNavLink to="icon-library" label="Icon Library" att={att} />
        <AdminNavLink to="forum-map" label="Forum Map" att={att} />
        <AdminNavLink to="notifications" label="Notification sounds" att={att} />
        <AdminNavLink to="guide-assets" label="Guide assets" att={att} />
        <AdminNavLink to="community-spotlight" label="Community Spotlight" att={att} />
      </nav>
      <div>
        <Outlet />
      </div>
    </div>
  );
}
