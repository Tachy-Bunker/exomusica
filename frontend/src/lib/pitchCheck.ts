import { voiceFlags } from "./voice";

/** Quick, honest checks on a pitch before it goes: what a busy curator would trip over. Pure; every check says why it matters. */
export interface PitchInput { subject: string; body: string; fileBytes: number; hasAudioLink: boolean; recipients: number }
export interface PitchNote { level: "warn" | "tip" | "ok"; text: string }

const MUSIC_LINK = /(soundcloud\.com|bandcamp\.com|youtu\.?be|vimeo\.com|spotify\.com|mixcloud\.com|apple\.com\/.*music|tidal\.com|archive\.org|@audio\()/i;
const ASK = /\b(would (?:love|be (?:glad|happy|honou?red))|please (?:consider|find|let)|let me know|looking forward|i(?:'d| would) like to (?:submit|propose|apply)|i am (?:submitting|applying)|submitting|i(?:'m| am) writing (?:to|about)|je (?:souhaite|vous propose|postule)|candidature)\b/i;
const GREET = /^\s*(dear|hi|hello|hey|bonjour|salut|cher|chère|good (?:morning|afternoon|evening))\b/i;

export function words(md: string): number {
  return md.replace(/!\[[^\]]*\]\([^)]*\)|@(?:audio|file|video)\([^)]*\)(?:\[[^\]]*\])?/g, " ").replace(/\{\{[^}]*\}\}/g, " x ").replace(/[#*_~`>|=+^{}[\]()-]/g, " ").split(/\s+/).filter(Boolean).length;
}

export function pitchChecks(p: PitchInput): PitchNote[] {
  const out: PitchNote[] = [], body = p.body.trim(), subj = p.subject.trim(), n = words(body);
  if (!subj) out.push({ level: "warn", text: "No subject." });
  else if (subj.length > 70) out.push({ level: "warn", text: `The subject is ${subj.length} characters; most inboxes cut it near 60. Put the point first.` });
  else if (subj.length < 12) out.push({ level: "tip", text: "A very short subject reads like spam. Say what it is: “Submission: <title>, <project>”." });
  else out.push({ level: "ok", text: "Subject length is fine." });
  if (body && !GREET.test(body.replace(/^[\s>*_#-]+/, ""))) out.push({ level: "tip", text: "No greeting at the start (Dear {{first_name|there}},). A named opening is the cheapest personalisation." });
  if (n > 250) out.push({ level: "warn", text: `${n} words. Curators skim; past about 200 the ask gets lost. Move the long bio into an attachment.` });
  else if (n > 0 && n < 25) out.push({ level: "tip", text: "Very short. One line on who you are and one on why this call is right for the work helps." });
  else if (n > 0) out.push({ level: "ok", text: `${n} words: a good length.` });
  if (body && !p.hasAudioLink && !MUSIC_LINK.test(body)) out.push({ level: "warn", text: "No way to listen: add a Bandcamp / SoundCloud / YouTube link or an audio attachment. Without it most reviewers stop here." });
  if (body && !ASK.test(body)) out.push({ level: "tip", text: "No clear ask. Say what you are sending and what you hope for (“I would like to submit…”, “please find…”)." });
  if (p.fileBytes > 10 * 1024 * 1024) out.push({ level: "warn", text: `${(p.fileBytes / 1048576).toFixed(1)} MB of attachments: many servers bounce above 10–15 MB. Link to a stream instead.` });
  if (/\b(sorry to bother|just a quick|no worries if|i know you(?:'re| are) busy)\b/i.test(body)) out.push({ level: "tip", text: "Apologetic openers weaken the pitch; start with what you are offering." });
  const vf = voiceFlags(p.body); if (vf.length) out.push({ level: "tip", text: `Weak phrasing (${vf.slice(0, 3).map((v) => `“${v.phrase.toLowerCase()}”: ${v.why}`).join("; ")}). Your text is untouched; cut what you can.` });
  if (/!{2,}|\b[A-Z]{5,}\b.*\b[A-Z]{5,}\b/.test(body)) out.push({ level: "tip", text: "Shouting (capitals or !!) lowers trust and trips spam filters." });
  if (p.recipients > 20) out.push({ level: "tip", text: `${p.recipients} recipients at once: send in smaller batches, and keep each message personal.` });
  return out;
}
