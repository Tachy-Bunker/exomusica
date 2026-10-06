import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useHome } from "../lib/home";
import { timeAgo } from "../lib/relativeTime";
import { useDocumentTitle } from "../lib/useDocumentTitle";

const TILES = [
  { to: "/conversations", name: "Conversations", line: "Every chat, and how alive it is" },
  { to: "/members", name: "Members", line: "Everyone aboard" },
  { to: "/discussion/map", name: "Conversation map", line: "The same chats, laid out as a map" },
  { to: "/challenges", name: "Challenges", line: "Prompts to make something from" },
  { to: "/sample-bank", name: "Sample bank", line: "Sounds to use in your own work" },
  { to: "/contribute", name: "Contribute", line: "Pick a branch project and add to it" },
  { to: "/cult", name: "Cult activities", line: "Community playlists and your own music" },
];

export function TelemetryPage() {
  useDocumentTitle("Telemetry");
  const { user } = useAuth();
  const { home } = useHome();
  const chats = home ? home.activity.filter((a) => a.kind === "chat") : [];
  return (
    <div className="home-page" data-testid="telemetry-page">
      <header className="home-hero">
        <h1>Telemetry</h1>
        <p className="home-lede">Where the community talks, trades sounds and makes things together.</p>
      </header>
      <section className="home-section" aria-labelledby="tm-where">
        <h2 id="tm-where" className="home-h2">Go to</h2>
        <div className="home-grid">
          {TILES.map((t) => (
            <Link key={t.to} className="home-card" to={t.to}>
              <span className="home-card-title">{t.name}</span>
              <span className="home-dim home-card-meta">{t.line}</span>
            </Link>
          ))}
          {user && (
            <Link className="home-card" to="/pms">
              <span className="home-card-title">Messages</span>
              <span className="home-dim home-card-meta">Private conversations</span>
            </Link>
          )}
        </div>
      </section>
      {chats.length > 0 && (
        <section className="home-section" aria-labelledby="tm-chats">
          <div className="home-h2-row"><h2 id="tm-chats" className="home-h2">Lately in chat</h2><Link to="/conversations" className="home-dim">All conversations</Link></div>
          <div className="home-grid">
            {chats.map((c) => (
              <Link key={c.href} className="home-card" to={c.href}>
                <span className="home-card-tag">{c.label}</span>
                <span className="home-card-title">{c.title}</span>
                <span className="home-dim home-card-meta">{timeAgo(c.at)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
