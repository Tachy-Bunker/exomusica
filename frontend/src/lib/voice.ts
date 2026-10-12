/** Weak phrases in a draft: flagged, never rewritten. Pure. */
export interface VoiceFlag { phrase: string; why: string; index: number }
const RULES: { re: RegExp; why: string }[] = [
  { re: /\b(?:sorry|apologi[sz]e) (?:to bother|for (?:bothering|the intrusion|writing))\b/gi, why: "an apology before you've said anything" },
  { re: /\bi (?:just )?(?:wanted|was hoping|thought i(?:'d| would)) to\b/gi, why: "hedged opening: say what you're doing" },
  { re: /\bjust (?:a (?:quick|short) |wanted |checking|following|reaching)/gi, why: "\"just\" shrinks the ask" },
  { re: /\b(?:i hope this (?:email|message|mail) finds you well)\b/gi, why: "filler greeting" },
  { re: /\b(?:if you(?:'d| would)? (?:have|get) (?:the )?time|when you (?:have|get) a (?:moment|chance)|no rush|no pressure)\b/gi, why: "gives them permission to ignore you" },
  { re: /\b(?:i (?:think|guess|believe) (?:that )?(?:maybe|perhaps|it might)|maybe|perhaps|kind of|sort of|a little bit|somewhat)\b/gi, why: "hedge" },
  { re: /\b(?:i know you(?:'re| are) (?:busy|swamped)|i don't want to take (?:up )?(?:too much of )?your time)\b/gi, why: "apologetic" },
  { re: /\b(?:humbly|unworthy|my (?:poor|humble) (?:attempt|work))\b/gi, why: "undersells the work" },
  { re: /\b(?:désolé de (?:vous )?déranger|je me permets de|n'hésitez pas à)\b/gi, why: "formule faible, va droit au but" },
];
export function voiceFlags(text: string): VoiceFlag[] {
  const clean = text.replace(/\{\{[^}]*\}\}/g, " ").replace(/^>.*$/gm, ""); // merge fields and quoted older mail aren't the writer's voice
  const all: VoiceFlag[] = [];
  for (const r of RULES) for (const m of clean.matchAll(r.re)) all.push({ phrase: m[0].trim(), why: r.why, index: m.index ?? 0 });
  const out: VoiceFlag[] = []; let end = -1; // overlapping hits ("i just wanted to" / "just wanted") count once
  for (const f of all.sort((a, b) => a.index - b.index || b.phrase.length - a.phrase.length)) { if (f.index < end) continue; out.push(f); end = f.index + f.phrase.length; }
  return out.slice(0, 12);
}
