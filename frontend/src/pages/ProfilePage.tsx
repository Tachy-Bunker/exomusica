import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

interface Profile {
  id: number;
  username: string;
  avatarUrl: string | null;
  bio: string | null;
  links: { label: string; url: string }[] | null;
  isGhost: boolean;
  createdAt: string;
}

export function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    if (!username) return;
    api<Profile>(`/api/users/${username}`).then(setProfile);
  }, [username]);

  if (!profile) return <p>Loading…</p>;

  return (
    <div style={{ maxWidth: 480 }}>
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          background: profile.avatarUrl ? `url(${profile.avatarUrl}) center/cover` : "var(--bg-elevated)",
        }}
      />
      <h1>{profile.username}</h1>
      {profile.isGhost && <p style={{ color: "var(--text-dim)" }}>This account is no longer active.</p>}
      {profile.bio && <p>{profile.bio}</p>}
      {profile.links && profile.links.length > 0 && (
        <ul>
          {profile.links.map((l) => (
            <li key={l.url}>
              <a href={l.url} target="_blank" rel="noreferrer">
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      )}
      {user && user.username !== profile.username && !profile.isGhost && (
        <Link className="btn" to={`/pms/${profile.username}`}>
          Message
        </Link>
      )}
    </div>
  );
}
