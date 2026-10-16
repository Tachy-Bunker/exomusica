import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, cacheUser, forgetUser, readCachedUser, takeLegacyToken, type CachedUser } from "./api";

interface AuthContextValue {
  user: CachedUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// The session is an httpOnly cookie the page cannot read. This provider keeps only the account's public details (name,
// admin flag) so the first paint is immediate, and asks the server on every load who the cookie belongs to.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CachedUser | null>(() => readCachedUser());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const onSessionExpired = () => { forgetUser(); setUser(null); };
    window.addEventListener("exomusica:session-expired", onSessionExpired);

    (async () => {
      try {
        // A login token an older page kept becomes the session cookie here, once, and is removed from the browser.
        const legacy = takeLegacyToken();
        if (legacy) await api("/api/auth/session", { method: "POST", headers: { Authorization: `Bearer ${legacy}` } });
        else if (!readCachedUser()) return; // never signed in on this browser: nothing to check
        const { user: me } = await api<{ user?: CachedUser }>("/api/auth/me");
        if (!me) throw new Error("no account in the reply");
        if (!alive) return;
        cacheUser(me);
        setUser(me);
      } catch {
        // Not signed in any more: the cookie expired, the account was signed out elsewhere, or it was removed.
        if (alive) { forgetUser(); setUser(null); }
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
      window.removeEventListener("exomusica:session-expired", onSessionExpired);
    };
  }, []);

  async function login(username: string, password: string) {
    const result = await api<{ user: CachedUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    cacheUser(result.user);
    setUser(result.user);
  }

  function logout() {
    // Ends every session of this account on the server; the local state clears at once either way.
    api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    forgetUser();
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
