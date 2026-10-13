import type { Member } from "./spaceHubs";

export interface Star { username: string; x: number; y: number; r: number; lit: boolean }

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; };

/** Members as stars in a unit square (0..100): the most active near the centre on a sunflower spiral, each nudged by its name so the sky doesn't look like a grid. Same input, same sky. */
export function layoutStars(members: Member[], inChat: Set<string>): Star[] {
  const sorted = [...members].sort((a, b) => b.messages - a.messages || a.username.localeCompare(b.username));
  const n = sorted.length;
  const maxMsg = Math.max(1, ...sorted.map((m) => m.messages));
  return sorted.map((m, i) => {
    const rad = Math.sqrt((i + 0.6) / (n + 0.6)) * 44;
    const ang = i * 2.399963 + (hash(m.username) - 0.5) * 0.9;
    const jitter = (hash(m.username + "r") - 0.5) * 2.2;
    return {
      username: m.username,
      x: 50 + Math.cos(ang) * (rad + jitter),
      y: 50 + Math.sin(ang) * (rad + jitter) * 0.8,
      r: 0.7 + Math.sqrt(m.messages / maxMsg) * 1.6,
      lit: inChat.has(m.username),
    };
  });
}

/** Lines joining the stars that are in a chat now, nearest neighbour first (a simple chain, so the shape reads as a constellation). */
export function chatLines(stars: Star[]): [Star, Star][] {
  const lit = stars.filter((s) => s.lit);
  if (lit.length < 2) return [];
  const left = lit.slice(1);
  let cur = lit[0];
  const out: [Star, Star][] = [];
  while (left.length) {
    let bi = 0, bd = Infinity;
    left.forEach((s, i) => { const d = (s.x - cur.x) ** 2 + (s.y - cur.y) ** 2; if (d < bd) { bd = d; bi = i; } });
    const next = left.splice(bi, 1)[0];
    out.push([cur, next]);
    cur = next;
  }
  return out;
}
