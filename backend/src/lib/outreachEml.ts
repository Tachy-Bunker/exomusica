import { unzipSync } from "fflate";
/** Reading mail files: which side wrote, whether the message belongs to the music-application process or is stray, and what it says about the answer. */

export interface MailFacts {
  fromEmail: string; fromName: string; toEmails: string[]; subject: string; text: string;
  hasListUnsubscribe: boolean; automated: boolean; inReplyTo: string | null; references: string[];
  own: Set<string>; known: Set<string>; knownDomains: Set<string>; sentIds: Set<string>;
}
export type MailKind = "application" | "stray";
export type MailHint = "decline" | "acceptance" | "confirmation" | null;
export interface MailVerdict { direction: "in" | "out"; counterparty: string | null; counterpartyName: string; kind: MailKind; reason: string; hint: MailHint; score: number }

const CALL_SUBJECT = /\b(submission|submitted|application|applying|open call|call for|calls? for (?:works|scores|proposals|artists|submissions)|residency|festival|commission|proposal|appel|candidature|programme|programming|your (?:music|work|piece|project)|demo|release|label|booking|performance|compilation|selection|selected|jury|artist|album|ep\b|single|premiere|showcase|concert|gig)\b/i;
const CALL_BODY = ["festival", "residency", "submission", "submit", "open call", "call for", "application", "apply", "curator", "programme", "program", "jury", "selected", "album", "release", "label", "soundcloud", "bandcamp", "composer", "electroacoustic", "sound art", "performance", "premiere", "concert", "exhibition", "candidature", "appel", "musique", "artiste", "your music", "your work", "your proposal"];
const PITCH = /\b(my (?:music|work|new (?:album|release|piece)|project)|i(?:'m| am) a (?:composer|sound artist|musician|producer)|listen (?:here|to)|private link|please find (?:attached|my)|submitting|i would like to (?:submit|propose|apply))\b/i;
const NOREPLY = /(?:^|[._-])(?:no-?reply|do-?not-?reply|donotreply|mailer-daemon|postmaster|notifications?|alerts?|bounce)s?@/i;
const STRAY_SUBJECT = /\b(invoice|receipt|order\b|shipping|shipped|delivery|tracking|password|verification code|verify your|security alert|sign-?in|statement|payment|subscription|your account|renewal|unsubscribe|newsletter|webinar|discount|% off|sale\b|coupon|reset your|confirm your email|welcome to|ticket|booking confirmation|reservation|bill\b|facture|commande|mot de passe)\b/i;
const SOCIAL = /@(?:facebookmail|linkedin|twitter|x|instagram|mail\.instagram|pinterest|tiktok|youtube|spotify|bandsintown|eventbrite|meetup)\.com$|@(?:e|em|mail|news|info|marketing)\./i;

export function mailHint(text: string): MailHint {
  const t = text.toLowerCase().slice(0, 6000);
  if (/(unfortunately|regret to (?:inform|tell)|we(?:'re| are) (?:sorry|unable)|not (?:been )?(?:selected|successful|retained)|won't be able|will not be (?:able|selected)|declin|malheureusement|nous regrettons|pas (?:été )?retenu|ne pourrons pas|leider nicht)/.test(t)) return "decline";
  if (/(pleased to (?:inform|invite|offer|announce)|happy to (?:inform|announce|invite|offer)|congratulations|you (?:have been|were|are) (?:selected|accepted|chosen)|(?:has|have) been (?:selected|accepted)|félicitations|heureux de vous|nous avons le plaisir|retenu pour)/.test(t)) return "acceptance";
  if (/(thank you for (?:your )?(?:submission|applying|application|interest)|we(?:'ve| have) received|received your|has been received|merci pour votre (?:candidature|envoi)|bien reçu)/.test(t)) return "confirmation";
  return null;
}

export function classifyMail(f: MailFacts): MailVerdict {
  const from = f.fromEmail.toLowerCase(), out = f.own.has(from);
  const counterparty = out ? (f.toEmails.map((e) => e.toLowerCase()).find((e) => !f.own.has(e)) ?? null) : from || null;
  const cp = counterparty ?? "", dom = cp.slice(cp.lastIndexOf("@") + 1);
  const reasons: string[] = []; let score = 0; const add = (n: number, why: string) => { score += n; reasons.push(`${n > 0 ? "+" : ""}${n} ${why}`); };
  const replied = [f.inReplyTo, ...f.references].some((id) => !!id && f.sentIds.has(id));
  if (replied) add(5, "answers a mail sent from here");
  if (cp && f.known.has(cp)) add(4, "from or to someone in the sheet"); else if (dom && f.knownDomains.has(dom)) add(2, "same organisation as a contact");
  if (CALL_SUBJECT.test(f.subject)) add(3, "subject talks about a call or submission");
  const body = `${f.subject}\n${f.text}`.toLowerCase(); const hits = CALL_BODY.filter((w) => body.includes(w)).length;
  if (hits) add(Math.min(4, hits * 0.8), `${hits} music-process word${hits === 1 ? "" : "s"} in the text`);
  if (out && PITCH.test(f.text)) add(2, "reads like a pitch");
  if (NOREPLY.test(from)) add(-3, "automatic sender");
  if (STRAY_SUBJECT.test(f.subject)) add(-6, "receipt, account or sales subject");
  if (SOCIAL.test(from) && !(cp && f.known.has(cp))) add(-4, "social or marketing sender");
  if (f.hasListUnsubscribe && !(cp && f.known.has(cp)) && !CALL_SUBJECT.test(f.subject)) add(-4, "mass mailing");
  if (f.automated && !replied) add(-1, "automatic message");
  const kind: MailKind = score >= 3 ? "application" : "stray";
  const top = reasons.sort((a, b) => Math.abs(parseFloat(b)) - Math.abs(parseFloat(a))).slice(0, 3).join("; ");
  return { direction: out ? "out" : "in", counterparty, counterpartyName: out ? "" : f.fromName, kind, reason: `${kind === "application" ? "Looks like part of the process" : "Looks unrelated"} (${Math.round(score * 10) / 10}): ${top || "no signals"}`, hint: kind === "application" && !out ? mailHint(f.text) : null, score };
}

/** Cleans a message-id header into the bare form used for matching: <abc@host>. */
export const cleanMessageId = (v: string | undefined | null): string | null => { const m = /<[^<>\s]+>/.exec(v ?? ""); return m ? m[0].toLowerCase() : null; };

export const emlFileName = (date: Date, subject: string, id: string): string =>
  `${date.toISOString().slice(0, 10)}_${subject.normalize("NFKD").replace(/[^\w\s-]/g, "").trim().toLowerCase().replace(/[\s_]+/g, "-").slice(0, 50) || "mail"}_${id}.eml`;

const MAX_FILES = 400, MAX_ENTRY = 10 * 1024 * 1024, MAX_TOTAL = 60 * 1024 * 1024;
/** A .zip is opened (its .eml files only, with size limits checked before anything is inflated); a lone .eml is passed through. */
export function expandMailFiles(files: { name: string; buf: Buffer }[]): { name: string; buf: Buffer }[] {
  const out: { name: string; buf: Buffer }[] = []; let total = 0;
  for (const f of files) {
    if (/\.zip$/i.test(f.name) || (f.buf.length > 3 && f.buf[0] === 0x50 && f.buf[1] === 0x4b)) {
      let n = 0; const entries = unzipSync(new Uint8Array(f.buf), { filter: (e) => { if (/(^|\/)(__MACOSX|\.)/.test(e.name) || !/\.eml$/i.test(e.name) || e.originalSize > MAX_ENTRY) return false; n++; total += e.originalSize; if (n > MAX_FILES || total > MAX_TOTAL) throw new Error("That zip holds too many or too large mails (limit 400 files, 60 MB)."); return true; } });
      for (const [name, data] of Object.entries(entries)) out.push({ name: name.split("/").pop() ?? name, buf: Buffer.from(data) });
    } else if (/\.eml$/i.test(f.name) || f.buf.subarray(0, 2000).toString("latin1").match(/^(?:received|from|date|subject|message-id|return-path|mime-version):/im)) out.push(f);
  }
  return out;
}

