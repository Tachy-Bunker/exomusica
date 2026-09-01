import { NavLink, Outlet } from "react-router-dom";

export function AdminLayout() {
  return (
    <div className="admin-layout">
      <nav className="admin-nav">
        <NavLink to="/admin/join-requests" className={({ isActive }) => (isActive ? "active" : "")}>
          Join requests
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
          Fonts
        </NavLink>
        <NavLink to="/admin/notifications" className={({ isActive }) => (isActive ? "active" : "")}>
          Notification sounds
        </NavLink>
      </nav>
      <div>
        <Outlet />
      </div>
    </div>
  );
}
