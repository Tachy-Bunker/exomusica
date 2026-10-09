/** Slash commands in the chat box: /cq, /report, /poll, /ab, /clip. Pure. Anything that isn't one of these is an ordinary message. */
export interface Parsed { kind: string; data: Record<string, unknown> }
export type SlashResult = { ok: true; msg: Parsed } | { ok: false; error: string } | null;

export const COMMANDS: { verb: string; usage: string; about: string }[] = [
  { verb: "cq", usage: "/cq <what you're calling about> [+listeners +feedback +collab +sample +answers]", about: "Call out to whoever's listening" },
  { verb: "report", usage: "/report <link or name> <R/S/T e.g. 5/7/6> [note]", about: "Signal report: Readability 1-5, Strength 1-9, Tone 1-9" },
  { verb: "poll", usage: "/poll <question> | <option> | <option> …", about: "Ask the room (2-6 options)" },
  { verb: "ab", usage: "/ab <question> | <audio link A> | <audio link B>", about: "A blind A/B: votes stay hidden until you vote" },
  { verb: "clip", usage: "/clip <audio link> <from>-<to e.g. 0:12-0:20> [label]", about: "Point at a few seconds of a sound" },
];

const secs = (t: string): number => { const m = /^(\d+):(\d{2})$/.exec(t); return m ? Number(m[1]) * 60 + Number(m[2]) : Number(t); };
const bad = (verb: string): SlashResult => ({ ok: false, error: `Usage: ${COMMANDS.find((c) => c.verb === verb)!.usage}` });

export function parseSlash(input: string): SlashResult {
  const m = /^\/(\w+)(?:\s+([\s\S]*))?$/.exec(input.trim());
  if (!m) return null;
  const verb = m[1].toLowerCase(), rest = (m[2] ?? "").trim();
  if (verb === "help") return { ok: false, error: COMMANDS.map((c) => c.usage).join("\n") };
  if (!COMMANDS.some((c) => c.verb === verb)) return null;
  if (!rest) return bad(verb);
  switch (verb) {
    case "cq": {
      const wants: string[] = [];
      const topic = rest.replace(/(^|\s)\+(\w+)/g, (_s, _p, w: string) => { wants.push(w.toLowerCase()); return " "; }).replace(/\s+/g, " ").trim();
      return topic ? { ok: true, msg: { kind: "cq", data: { topic, wants } } } : bad(verb);
    }
    case "report": {
      const re = /(^|\s)([1-5])\s?[/ ]?\s?([1-9])\s?[/ ]?\s?([1-9])(?=\s|$)/;
      const hit = re.exec(rest);
      if (!hit) return bad(verb);
      const target = rest.slice(0, hit.index).trim(), note = rest.slice(hit.index + hit[0].length).trim();
      return target ? { ok: true, msg: { kind: "report", data: { target, r: Number(hit[2]), s: Number(hit[3]), t: Number(hit[4]), note } } } : bad(verb);
    }
    case "poll": {
      const [q, ...options] = rest.split("|").map((x) => x.trim());
      return q && options.filter(Boolean).length >= 2 ? { ok: true, msg: { kind: "poll", data: { q, options: options.filter(Boolean) } } } : bad(verb);
    }
    case "ab": {
      const [q, a, b] = rest.split("|").map((x) => x.trim());
      return q && a && b ? { ok: true, msg: { kind: "ab", data: { q, a, b } } } : bad(verb);
    }
    default: { // clip
      const mm = /^(\S+)\s+(\d+(?::\d{2})?)\s*[-–]\s*(\d+(?::\d{2})?)(?:\s+([\s\S]+))?$/.exec(rest);
      if (!mm) return bad(verb);
      return { ok: true, msg: { kind: "clip", data: { url: mm[1], from: secs(mm[2]), to: secs(mm[3]), label: mm[4]?.trim() ?? "" } } };
    }
  }
}

/** While typing a "/", the commands that fit. */
export function hintFor(draft: string): { verb: string; usage: string; about: string }[] {
  const m = /^\/(\w*)$/.exec(draft.trimStart().split(/\s/)[0] === draft.trim() ? draft.trim() : "");
  if (m) return COMMANDS.filter((c) => c.verb.startsWith(m[1].toLowerCase()));
  const v = /^\/(\w+)\s/.exec(draft);
  return v ? COMMANDS.filter((c) => c.verb === v[1].toLowerCase()) : [];
}
