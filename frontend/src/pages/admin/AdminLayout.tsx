import { NavLink, Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import { api } from "../../lib/api";

export function AdminLayout() {
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    function checkPending() {
      api<{ status: string }[]>("/api/admin/join-requests").then((reqs) => {
        setPendingCount(reqs.filter((r) => r.status === "PENDING").length);
      });
    }
    checkPending();
    const interval = setInterval(checkPending, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="admin-layout">
      <nav className="admin-nav">
        <NavLink to="/admin/join-requests" className={({ isActive }) => (isActive ? "active" : "")} style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
          Join requests
          {pendingCount > 0 && <span className="admin-nav-pending-dot" title={`${pendingCount} pending`} />}
        </NavLink>
        <NavLink to="/admin/branches" className={({ isActive }) => (isActive ? "active" : "")}>
          Branches
        </NavLink>
        <NavLink to="/admin/channels" className={({ isActive }) => (isActive ? "active" : "")}>
          Forum topics
        </NavLink>
        <NavLink to="/admin/users" className={({ isActive }) => (isActive ? "active" : "")}>
          Users
        </NavLink>
        <NavLink to="/admin/albums" className={({ isActive }) => (isActive ? "active" : "")}>
          Albums
        </NavLink>
        <NavLink to="/admin/wiki" className={({ isActive }) => (isActive ? "active" : "")}>
          Wiki
        </NavLink>
        <NavLink to="/admin/blog" className={({ isActive }) => (isActive ? "active" : "")}>
          Blog
        </NavLink>
        <NavLink to="/admin/emoji" className={({ isActive }) => (isActive ? "active" : "")}>
          Emoji
        </NavLink>
        <NavLink to="/admin/email-templates" className={({ isActive }) => (isActive ? "active" : "")}>
          Email templates
        </NavLink>
        <NavLink to="/admin/audit-log" className={({ isActive }) => (isActive ? "active" : "")}>
          Action log
        </NavLink>
        <NavLink to="/admin/about" className={({ isActive }) => (isActive ? "active" : "")}>
          About page
        </NavLink>
        <NavLink to="/admin/fonts" className={({ isActive }) => (isActive ? "active" : "")}>
          Fonts &amp; Misc
        </NavLink>
        <NavLink to="/admin/fx-settings" className={({ isActive }) => (isActive ? "active" : "")}>
          Spacemap field
        </NavLink>
        <NavLink to="/admin/newsletter" className={({ isActive }) => (isActive ? "active" : "")}>
          Newsletter
        </NavLink>
        <NavLink to="/admin/discord-import" className={({ isActive }) => (isActive ? "active" : "")}>
          Discord import
        </NavLink>
        <NavLink to="/admin/storage" className={({ isActive }) => (isActive ? "active" : "")}>
          Storage
        </NavLink>
        <NavLink to="/admin/discord-bridge" className={({ isActive }) => (isActive ? "active" : "")}>
          Discord bridge
        </NavLink>
        <NavLink to="/admin/collaborators" className={({ isActive }) => (isActive ? "active" : "")}>
          Collaborators
        </NavLink>
        <NavLink to="/admin/embeds" className={({ isActive }) => (isActive ? "active" : "")}>
          Favicon & Embeds
        </NavLink>
        <NavLink to="/admin/notifications" className={({ isActive }) => (isActive ? "active" : "")}>
          Notification sounds
        </NavLink>
        <NavLink to="/admin/guide-assets" className={({ isActive }) => (isActive ? "active" : "")}>
          Guide assets
        </NavLink>
      </nav>
      <div>
        <Outlet />
      </div>
    </div>
  );
}
