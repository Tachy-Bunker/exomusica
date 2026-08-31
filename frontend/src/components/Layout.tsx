import { useEffect } from "react";
import { Link, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useEmojiStore } from "../lib/emojiStore";
import { useGlobalPlayerShortcuts } from "../lib/useGlobalPlayerShortcuts";
import { PlayerBar } from "./PlayerBar";

export function Layout() {
  const { user, logout } = useAuth();
  const loadEmojis = useEmojiStore((s) => s.load);
  useGlobalPlayerShortcuts();

  useEffect(() => {
    loadEmojis();
  }, [loadEmojis]);

  return (
    <div className="app-shell">
      <header className="top-nav">
        <Link to="/" className="brand">
          Exomusica
        </Link>
        <nav>
          <Link to="/about">About</Link>
          <Link to="/wiki">Wiki</Link>
          <Link to="/news">News</Link>
          <Link to="/discussion">Discussion</Link>
        </nav>
        <div className="spacer" />
        {user ? (
          <>
            {user.isAdmin && <Link to="/admin">Admin</Link>}
            <Link to="/pms">Messages</Link>
            <Link to="/account">{user.username}</Link>
            <button className="btn" onClick={logout}>
              Log out
            </button>
          </>
        ) : (
          <Link to="/login">Log in</Link>
        )}
      </header>

      <main className="main-content">
        <Outlet />
      </main>

      <PlayerBar />
    </div>
  );
}
