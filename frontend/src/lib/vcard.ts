/** Contact-list formats for Outreach: vCard (.vcf: Apple/Google/Outlook contacts, phones) out and in, and Google/Outlook contact CSVs in. Pure. */
import type { Col, Contact } from "../components/outreach/types";
import { cellText, toCsv } from "./outreachSheet";

const esc = (s: string): string => s.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\;");
const unesc = (s: string): string => s.replace(/\\([nN,;\\])/g, (_m, c: string) => (c === "n" || c === "N" ? "\n" : c));
function fold(line: string): string { const out: string[] = []; let s = line; while (s.length > 74) { out.push(s.slice(0, 74)); s = " " + s.slice(74); } out.push(s); return out.join("\r\n"); }

/** A column that reads as a phone / organisation / website, by its name or type. */
const looksLike = (c: Col, re: RegExp) => re.test(c.name) || re.test(c.key);

export function toVcf(list: Contact[], cols: Col[], groupName: (id: number) => string | undefined): string {
  const phone = cols.find((c) => c.type === "text" && looksLike(c, /phone|tel|mobile/i));
  const org = cols.find((c) => c.type === "text" && looksLike(c, /^(org|organi[sz]ation|company|festival|label)/i));
  const url = cols.find((c) => c.type === "url");
  const used = new Set([phone?.key, org?.key, url?.key]);
  return list.filter((c) => c.name || c.email).map((c) => {
    const parts = c.name.trim().split(/\s+/), given = parts[0] ?? "", family = parts.slice(1).join(" ");
    const L = ["BEGIN:VCARD", "VERSION:3.0", `FN:${esc(c.name || c.email)}`, `N:${esc(family)};${esc(given)};;;`];
    if (c.email) L.push(`EMAIL;TYPE=INTERNET:${esc(c.email)}`);
    if (phone && c.data[phone.key]) L.push(`TEL:${esc(cellText(c.data[phone.key]))}`);
    if (org && c.data[org.key]) L.push(`ORG:${esc(cellText(c.data[org.key]))}`);
    if (url && c.data[url.key]) L.push(`URL:${esc(cellText(c.data[url.key]))}`);
    const g = c.groups.map(groupName).filter((x): x is string => !!x); if (g.length) L.push(`CATEGORIES:${g.map(esc).join(",")}`);
    const notes = cols.filter((k) => !used.has(k.key) && cellText(c.data[k.key]) !== "").map((k) => `${k.name}: ${cellText(c.data[k.key])}`);
    if (c.lastSentAt) notes.push(`Last written to: ${c.lastSentAt} (${c.sentCount}×)`);
    if (notes.length) L.push(`NOTE:${esc(notes.join("\n"))}`);
    L.push("END:VCARD"); return L.map(fold).join("\r\n");
  }).join("\r\n") + "\r\n";
}

export interface VCardRow { name: string; email: string; groups: string[]; /** every other thing the card says, by the column it belongs in */ fields: Record<string, string> }
export const VCARD_HINTS: Record<string, string> = { Website: "url", "Website 2": "url", Notes: "longtext", Birthday: "date", "Other email": "email" };

const SKIP = new Set(["VERSION", "PRODID", "UID", "REV", "PHOTO", "LOGO", "SOUND", "KEY", "KIND", "LABEL", "SORT-STRING", "CLASS", "SOURCE", "FN", "N", "EMAIL", "CATEGORIES", "BEGIN", "END", "MEMBER"]);
const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s_-])([a-z])/g, (_m, p: string, c: string) => (p === "-" || p === "_" ? " " : p) + c.toUpperCase()).trim();
const LABEL: Record<string, string> = { TEL: "Phone", ORG: "Organization", TITLE: "Title", ROLE: "Role", URL: "Website", NOTE: "Notes", BDAY: "Birthday", NICKNAME: "Nickname", TZ: "Timezone", ADR: "Address", GEO: "Location", IMPP: "Messenger", ANNIVERSARY: "Anniversary" };
function birthday(v: string): string { const m = /^(\d{4})-?(\d\d)-?(\d\d)/.exec(v.trim()); return m ? `${m[1]}-${m[2]}-${m[3]}` : v.trim(); }

/** Every card in a .vcf: name, email, groups, and each other property as a column value (Phone, Organization, Website, Address, Birthday, Notes, social profiles, X- extras…). */
export function parseVcf(text: string): VCardRow[] {
  const lines = text.replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  const out: VCardRow[] = []; let cur: VCardRow | null = null;
  const put = (label: string, v: string) => { const val = v.trim(); if (!val || !cur) return; let key = label, i = 2; while (key in cur.fields && i <= 4) key = `${label} ${i++}`; if (key in cur.fields) return; cur.fields[key] = val; };
  for (const raw of lines) {
    const line = raw.trim(); if (!line) continue;
    if (/^BEGIN:VCARD/i.test(line)) { cur = { name: "", email: "", groups: [], fields: {} }; continue; }
    if (/^END:VCARD/i.test(line)) { if (cur && (cur.name || cur.email)) out.push(cur); cur = null; continue; }
    if (!cur) continue;
    const i = line.indexOf(":"); if (i < 0) continue;
    const head = line.slice(0, i).split(";"), prop = head[0].replace(/^item\d+\./i, "").toUpperCase(), val = line.slice(i + 1);
    const type = (head.slice(1).find((p) => /^type=/i.test(p)) ?? "").replace(/^type=/i, "").split(",")[0];
    if (prop === "FN") cur.name = unesc(val).trim();
    else if (prop === "N") { if (!cur.name) { const [fam = "", giv = ""] = val.split(";"); cur.name = `${unesc(giv)} ${unesc(fam)}`.trim(); } }
    else if (prop === "EMAIL") { const e = unesc(val).trim().toLowerCase(); if (!cur.email) cur.email = e; else put("Other email", e); }
    else if (prop === "CATEGORIES") cur.groups.push(...val.split(/(?<!\\),/).map((x) => unesc(x).trim()).filter(Boolean));
    else if (SKIP.has(prop)) continue;
    else if (prop === "X-SOCIALPROFILE" || prop === "X-SOCIAL-PROFILE") put(titleCase(type || "Social profile"), unesc(val));
    else if (prop === "ADR") put("Address", val.split(";").map(unesc).map((x) => x.trim()).filter(Boolean).join(", "));
    else if (prop === "ORG") put("Organization", val.split(";").map(unesc).filter(Boolean).join(", "));
    else if (prop === "BDAY") put("Birthday", birthday(unesc(val)));
    else if (prop === "TZ") { const z = unesc(val).trim(); if (/^[A-Za-z_]+\/[A-Za-z_\/+-]+$/.test(z)) put("Timezone", z); }
    else if (prop.startsWith("X-ABLABEL") || prop === "X-ABDATE" || prop === "X-ABRELATEDNAMES") continue;
    else put(LABEL[prop] ?? titleCase(prop.replace(/^X-/, "")), unesc(val));
  }
  return out;
}

/** Minimal CSV reader (quotes, doubled quotes, newlines inside quotes; , ; or tab). */
export function parseCsv(text: string): string[][] {
  const t = text.replace(/^\uFEFF/, ""), first = t.split(/\r?\n/, 1)[0];
  const d = [",", ";", "\t"].map((x) => [x, first.split(x).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = []; let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === d) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

const H = (h: string) => h.trim().toLowerCase();
/** Google Contacts / Outlook CSV -> the plain header the importer reads. Anything else is returned unchanged. */
export function normalizeContactsCsv(text: string): { csv: string; kind: "google" | "outlook" | "plain" } {
  const rows = parseCsv(text); if (rows.length < 2) return { csv: text, kind: "plain" };
  const head = rows[0].map(H), has = (n: string) => head.indexOf(n);
  const google = has("first name") >= 0 && head.some((h) => /^e-?mail 1 - value$/.test(h)), outlook = has("first name") >= 0 && has("e-mail address") >= 0;
  if (!google && !outlook) return { csv: text, kind: "plain" };
  const pick = (r: string[], ...names: string[]) => { for (const n of names) { const i = has(n); if (i >= 0 && (r[i] ?? "").trim()) return r[i].trim(); } return ""; };
  const out: string[][] = [["Name", "Email", "Phone", "Organization", "Website", "Notes", "Groups"]];
  for (const r of rows.slice(1)) {
    const name = [pick(r, "first name"), pick(r, "middle name"), pick(r, "last name")].filter(Boolean).join(" ") || pick(r, "name", "nickname", "file as");
    out.push([name, pick(r, "e-mail 1 - value", "e-mail address").toLowerCase(), pick(r, "phone 1 - value", "mobile phone", "primary phone", "business phone"), pick(r, "organization name", "organization 1 - name", "company"), pick(r, "website 1 - value", "web page"), pick(r, "notes"),
      pick(r, "labels", "categories").split(/\s*:::\s*|;/).map((x) => x.replace(/^\* /, "").trim()).filter((x) => x && x !== "myContacts").join("; ")]);
  }
  return { csv: toCsv(dropEmptyColumns(out), false), kind: google ? "google" : "outlook" };
}
function dropEmptyColumns(rows: string[][]): string[][] {
  const keep = rows[0].map((_h, i) => i < 2 || rows.slice(1).some((r) => (r[i] ?? "") !== ""));
  return rows.map((r) => r.filter((_c, i) => keep[i]));
}

/** A .vcf as the CSV the importer reads, with a column for every kind of thing the cards carry (and the types those columns should get). */
export function vcfToCsv(text: string): { csv: string; hints: Record<string, string>; count: number } {
  const cards = parseVcf(text), extra: string[] = [];
  for (const c of cards) for (const k of Object.keys(c.fields)) if (!extra.includes(k)) extra.push(k);
  const hasGroups = cards.some((c) => c.groups.length);
  const head = ["Name", "Email", ...(hasGroups ? ["Groups"] : []), ...extra];
  const rows = [head, ...cards.map((c) => [c.name, c.email, ...(hasGroups ? [c.groups.join("; ")] : []), ...extra.map((k) => c.fields[k] ?? "")])];
  const hints: Record<string, string> = {}; for (const k of extra) { const h = VCARD_HINTS[k] ?? (/^(Website|Twitter|Instagram|Facebook|Linkedin|Youtube|Soundcloud|Bandcamp)\b/.test(k) ? "url" : undefined); if (h) hints[k] = h; }
  return { csv: toCsv(rows, false), hints, count: cards.length };
}
