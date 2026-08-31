import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, getToken, setToken } from "./api";

interface AuthedUser {
  id: number;
  username: string;
  isAdmin: boolean;
}

interface AuthContextValue {
  user: AuthedUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// The backend never sends "who am I" from a bare token — login's response
// is the only place we learn the user object, so we cache it alongside the
// token rather than re-decoding the JWT client-side.
const USER_KEY = "exomusica_user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthedUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    const cached = localStorage.getItem(USER_KEY);
    if (token && cached) setUser(JSON.parse(cached));
    setLoading(false);
  }, []);

  async function login(username: string, password: string) {
    const result = await api<{ token: string; user: AuthedUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    setToken(result.token);
    localStorage.setItem(USER_KEY, JSON.stringify(result.user));
    setUser(result.user);
  }

  function logout() {
    setToken(null);
    localStorage.removeItem(USER_KEY);
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
