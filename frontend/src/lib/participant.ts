/** A random, anonymous token for answering tests without an account. The server stores only its hash; it never links to a person. */
const KEY = "exomusica_participant";
export function participantToken(): string {
  try {
    let t = localStorage.getItem(KEY);
    if (!t || !/^[A-Za-z0-9_-]{16,64}$/.test(t)) {
      const b = crypto.getRandomValues(new Uint8Array(18));
      t = btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      localStorage.setItem(KEY, t);
    }
    return t;
  } catch { return "s" + Math.random().toString(36).slice(2).padEnd(20, "x"); } // storage blocked: this visit only
}
