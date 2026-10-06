const TOKEN_KEY = "exomusica_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  /** `body` is the server's whole reply, for callers that need more than the short message (e.g. an upload's per-file reasons). */
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const isFormData = options.body instanceof FormData;
  const res = await fetch(path, {
    ...options,
    headers: {
      ...(options.body && !isFormData ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 204) return undefined as T;

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json() : undefined;

  if (!res.ok) {
    if (res.status === 401 && token && body?.error === "invalid or expired token") {
      // The token we sent was rejected (expired, or the server's secret
      // changed). Leaving it in place would keep the UI showing a
      // logged-in user whose every authenticated request silently
      // fails - so clear it and let the auth provider reset.
      setToken(null);
      window.dispatchEvent(new Event("exomusica:session-expired"));
    }
    throw new ApiError(res.status, body?.error ?? res.statusText, body);
  }
  return body as T;
}
