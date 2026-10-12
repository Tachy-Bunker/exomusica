import { applyMail, mediaLine } from "../src/lib/mailEdit";
import { cellText, daysBetween, exportRows, filterContacts, isDue, mergeFields, relDay, sortContacts, toCsv, toJson, parseAddressList } from "../src/lib/outreachSheet";
import { toVcf, parseVcf, parseCsv, normalizeContactsCsv, vcfToCsv } from "../src/lib/vcard";
import { zipStore, zipName, crc32 } from "../src/lib/zip";
import { pitchChecks, words } from "../src/lib/pitchCheck";
import { todayLists, followUpDraft } from "../src/lib/today";
import type { Col, Contact } from "../src/components/outreach/types";
let n = 0; const eq = (a: unknown, b: unknown, m: string) => { n++; if (JSON.stringify(a) !== JSON.stringify(b)) { console.error("FAIL", m, JSON.stringify(a), "!=", JSON.stringify(b)); process.exit(1); } };

let e = applyMail("hello world", 0, 5, "underline"); eq(e.value, "++hello++ world", "underline");
e = applyMail(e.value, e.start, e.end, "underline"); eq(e.value, "hello world", "underline toggles off");
e = applyMail("a", 0, 1, "highlight"); eq(e.value, "==a==", "highlight");
e = applyMail("", 0, 0, "sup"); eq(e.value, "^up^", "sup placeholder");
e = applyMail("Title", 0, 5, "h2"); eq(e.value, "## Title", "h2"); e = applyMail(e.value, 0, 8, "h2"); eq(e.value, "Title", "h2 toggles");
e = applyMail("## T", 0, 4, "h3"); eq(e.value, "### T", "h2 -> h3");
e = applyMail("see", 0, 3, "button"); eq(e.value, "[[see]](https://)", "button"); eq(e.value.slice(e.start, e.end), "https://", "button selects url");
e = applyMail("x", 1, 1, "center"); eq(e.value, "x\n:::center\ntext\n:::\n", "center");
e = applyMail("hi", 0, 2, "color", "#112233"); eq(e.value, "{c:#112233|hi}", "color");
e = applyMail("hi", 0, 2, "color", "javascript:"); eq(e.value, "{c:#c0392b|hi}", "bad colour falls back");
e = applyMail("hi", 0, 2, "size", "99"); eq(e.value, "{s:48|hi}", "size clamps");
e = applyMail("hi", 0, 2, "color", "#112233"); e = applyMail(e.value, e.start, e.end, "size", "24"); eq(e.value, "{c:#112233 s:24|hi}", "size after colour joins the same span");
eq(e.value.slice(e.start, e.end), "hi", "... and keeps the text selected");
e = applyMail(e.value, e.start, e.end, "color", "#00ff00"); eq(e.value, "{c:#00ff00 s:24|hi}", "colour again replaces the colour");
e = applyMail("{s:20|yo}", 0, 9, "color", "#abcdef"); eq(e.value, "{c:#abcdef s:20|yo}", "selecting the whole span works too");
e = applyMail("Dear , ", 5, 5, "field", "first_name"); eq(e.value, "Dear {{first_name}}, ", "field");
e = applyMail("a", 1, 1, "insert", "BIO"); eq(e.value, "a\nBIO\n", "insert on own line");
e = applyMail("x", 0, 1, "bold"); eq(e.value, "**x**", "falls through to shared toolbar");
eq(mediaLine("/uploads/outreach/ab-pic.png", "pic.png", "image/png", { width: "60%", align: "center" }), "![pic](/uploads/outreach/ab-pic.png){width=60% align=center}", "image line");
eq(mediaLine("/u/x.mp3", "my-demo.mp3", "audio/mpeg"), "@audio(/u/x.mp3)[my demo]", "audio line");
eq(mediaLine("/u/x.pdf", "press.pdf", "application/pdf"), "@file(/u/x.pdf)[press]", "file line");

const cols: Col[] = [{ id: 1, key: "festival", name: "Festival", type: "text", options: [], hidden: false, width: null }, { id: 2, key: "fee", name: "Fee", type: "number", options: [], hidden: true, width: null }, { id: 3, key: "tags", name: "Tags", type: "multiselect", options: ["a", "b"], hidden: false, width: null }];
const C = (id: number, name: string, over: Partial<Contact> = {}): Contact => ({ id, name, email: `${name.toLowerCase()}@x.org`, data: {}, lastSentAt: null, sentCount: 0, followUpAt: null, groups: [], status: "", deadline: null, repliedAt: null, timezone: "", ...over });
const list = [C(1, "Bea", { data: { festival: "Mutek", fee: 100 }, sentCount: 2, lastSentAt: "2026-09-01", followUpAt: "2026-10-01" }), C(2, "Al", { data: { festival: "Atonal", fee: 20, tags: ["a", "b"] } }), C(3, "Cy", { data: { fee: 5 }, followUpAt: "2026-12-01" })];
eq(daysBetween("2026-10-12", "2026-10-15"), 3, "days"); eq(relDay("2026-10-12", "2026-10-09"), "3 days ago", "rel past"); eq(relDay("2026-10-12", "2026-10-12"), "today", "rel today"); eq(relDay("2026-10-12", "2026-12-12"), "in 2 months", "rel future"); eq(relDay("2026-10-12", null), "", "rel none");
eq(isDue(list[0], "2026-10-12"), true, "due"); eq(isDue(list[2], "2026-10-12"), false, "not due"); eq(isDue(list[1], "2026-10-12"), false, "no date");
eq(filterContacts(list, cols, { q: "", due: true, never: false }, "2026-10-12").map((c) => c.id), [1], "due filter");
eq(filterContacts(list, cols, { q: "", due: false, never: true }, "2026-10-12").map((c) => c.id), [2, 3], "never filter");
eq(filterContacts(list, cols, { q: "atonal", due: false, never: false }, "2026-10-12").map((c) => c.id), [2], "search in columns");
eq(filterContacts(list, cols, { q: "cy@", due: false, never: false }, "2026-10-12").map((c) => c.id), [3], "search email");
eq(sortContacts(list, cols, "name", 1).map((c) => c.id), [2, 1, 3], "sort name");
eq(sortContacts(list, cols, "fee", -1).map((c) => c.id), [1, 2, 3], "sort number desc");
eq(sortContacts(list, cols, "festival", 1).map((c) => c.id), [2, 1, 3], "empty sinks");
eq(sortContacts(list, cols, "festival", -1).map((c) => c.id), [1, 2, 3], "empty sinks when descending too");
eq(sortContacts(list, cols, "followUpAt", 1).map((c) => c.id), [1, 3, 2], "sort dates");
eq(cellText(["a", "b"]), "a, b", "cell list"); eq(cellText(true), "yes", "cell bool"); eq(cellText(undefined), "", "cell none");
eq(exportRows(list, cols, false)[0], ["Name", "Email", "Groups", "Status", "Deadline", "Festival", "Tags", "Last sent", "Times sent", "Follow up", "Timezone", "Place", "Latitude", "Longitude"], "export header hides hidden");
eq(exportRows(list, cols)[2].slice(0, 8), ["Al", "al@x.org", "", "", "", "Atonal", "20", "a, b"], "export row");
eq(toCsv([["a", "b,c", 'q"q'], ["=SUM(1)", "-5", "line\nbreak"]]), '﻿a,"b,c","q""q"\r\n\'=SUM(1),-5,"line\nbreak"\r\n', "csv quoting and formula guard");
eq(JSON.parse(toJson(list, cols))[0].Festival, "Mutek", "json");
eq(mergeFields(cols).map((f) => f.key).slice(0, 6), ["name", "first_name", "email", "last_sent", "sent_count", "festival"], "merge fields");
eq(parseAddressList("a@x.org, b@y.org;\nc@z.org"), ["a@x.org", "b@y.org", "c@z.org"], "address list");
// groups
const G = [{ id: 1, name: "Festivals" }, { id: 2, name: "Open calls" }];
const gl = [C(1, "Bea", { groups: [2] }), C(2, "Al", { groups: [1, 2] }), C(3, "Cy")];
eq(filterContacts(gl, [], { q: "", due: false, never: false, group: 2 }, "2026-10-12").map((c) => c.id), [1, 2], "filter by group");
eq(filterContacts(gl, [], { q: "", due: false, never: false, group: "none" }, "2026-10-12").map((c) => c.id), [3], "filter ungrouped");
eq(sortContacts(gl, [], "groups", 1, G).map((c) => c.id), [2, 1, 3], "sort by group name, ungrouped last");
eq(exportRows(gl, [], true, G)[2][2], "Festivals; Open calls", "export carries group names");
eq(JSON.parse(toJson(gl, [], G))[1].groups, ["Festivals", "Open calls"], "json groups");

// vcard / contact csv
const vc = toVcf([C(1, "Bea Lund", { groups: [1], data: { festival: "Mutek, MX", phone: "+33 6 12" } })], [{ id: 1, key: "festival", name: "Festival", type: "text", options: [], hidden: false, width: null }, { id: 2, key: "phone", name: "Phone", type: "text", options: [], hidden: false, width: null }], (id) => G.find((g) => g.id === id)?.name);
eq(vc.includes("FN:Bea Lund") && vc.includes("N:Lund;Bea;;;") && vc.includes("EMAIL;TYPE=INTERNET:bea lund@x.org") && vc.includes("TEL:+33 6 12") && vc.includes("ORG:Mutek\\, MX") && vc.includes("CATEGORIES:Festivals"), true, "vcard out");
const back = parseVcf(vc); eq([back[0].name, back[0].email, back[0].fields.Phone, back[0].fields.Organization, back[0].groups], ["Bea Lund", "bea lund@x.org", "+33 6 12", "Mutek, MX", ["Festivals"]], "vcard round trip");
const card = parseVcf("BEGIN:VCARD\nVERSION:3.0\nN:Doe;Jo;;;\nitem1.EMAIL;type=INTERNET:JO@X.ORG\nEMAIL:two@x.org\nTEL;TYPE=CELL:+33 6 12\nTEL;TYPE=WORK:+33 1 99\nORG:Fest;Sonic\nTITLE:Curator\nURL:https://f.org\nADR;TYPE=WORK:;;1 Rue A;Paris;;75001;France\nBDAY:19900502\nNOTE:line one\\nline two\nX-SOCIALPROFILE;type=twitter:https://t.co/jo\nX-CUSTOMTHING:hello\nTZ:Europe/Paris\nPHOTO;ENCODING=b:AAAA\nCATEGORIES:A,B\nEND:VCARD\nBEGIN:VCARD\nFN:No mail\nEND:VCARD");
eq(card.length, 2, "two cards, one without an email still kept"); eq([card[0].name, card[0].email, card[0].groups], ["Jo Doe", "jo@x.org", ["A", "B"]], "name from N, first email, groups");
eq(card[0].fields, { "Other email": "two@x.org", Phone: "+33 6 12", "Phone 2": "+33 1 99", Organization: "Fest, Sonic", Title: "Curator", Website: "https://f.org", Address: "1 Rue A, Paris, 75001, France", Birthday: "1990-05-02", Notes: "line one\nline two", Twitter: "https://t.co/jo", "Customthing": "hello", Timezone: "Europe/Paris" }, "every property becomes a column value; photo skipped");
eq(parseVcf("BEGIN:VCARD\nFN:A very long name that gets folded onto\n  the next line\nEND:VCARD")[0].name, "A very long name that gets folded onto the next line", "unfolding");
const imp = vcfToCsv("BEGIN:VCARD\nFN:Jo\nTEL:+33 6\nURL:https://a.org\nBDAY:1990-05-02\nCATEGORIES:Labels\nEND:VCARD\nBEGIN:VCARD\nFN:Al\nORG:Z\nEND:VCARD");
eq(parseCsv(imp.csv), [["Name", "Email", "Groups", "Phone", "Website", "Birthday", "Organization"], ["Jo", "", "Labels", "+33 6", "https://a.org", "1990-05-02", ""], ["Al", "", "", "", "", "", "Z"]], "csv has a column per kind of data used");
eq(imp.hints, { Website: "url", Birthday: "date" }, "typed columns for links and dates"); eq(imp.count, 2, "count");
const g = normalizeContactsCsv('First Name,Last Name,E-mail 1 - Value,Phone 1 - Value,Labels\nJo,Doe,JO@x.org,+33 6 1,* myContacts ::: Festivals\n');
eq(g.kind, "google", "google csv detected"); eq(parseCsv(g.csv), [["Name", "Email", "Phone", "Groups"], ["Jo Doe", "jo@x.org", "+33 6 1", "Festivals"]], "google csv normalised (+ phone not formula-guarded)");
eq(normalizeContactsCsv("Name,Email\nA,a@x.org\n").kind, "plain", "plain csv untouched");
eq(parseCsv('a;b\n"x;1";"he said ""hi"""\n'), [["a", "b"], ["x;1", 'he said "hi"']], "csv parser: delimiter, quotes");

// zip
const zf = zipStore([{ name: "Jo Doe.vcf", data: new TextEncoder().encode("BEGIN:VCARD\r\nEND:VCARD\r\n") }, { name: "é.vcf", data: new TextEncoder().encode("x") }]);
eq([zf[0], zf[1], zf[2], zf[3]], [0x50, 0x4b, 3, 4], "zip signature"); eq(crc32(new TextEncoder().encode("123456789")), 0xcbf43926, "crc32 check value");
{ const taken = new Set<string>(); eq([zipName("Bea/Lund:", ".vcf", taken), zipName("Bea Lund", ".vcf", taken), zipName("", ".vcf", taken)], ["Bea Lund.vcf", "Bea Lund 2.vcf", "contact.vcf"], "zip names are safe and unique"); }
(globalThis as { __zip?: Uint8Array }).__zip = zf; (await import("node:fs")).writeFileSync("/tmp/test.zip", zf);
// pitch
const pn = (o: Partial<Parameters<typeof pitchChecks>[0]>) => pitchChecks({ subject: "Submission: Cave Tones", body: "Dear Jo,\n\nI would like to submit my piece. Listen: https://x.bandcamp.com/track/a . Thank you.", fileBytes: 0, hasAudioLink: false, recipients: 1, ...o });
eq(pn({}).filter((x) => x.level === "warn").length, 0, "a good pitch has no warnings");
eq(pn({ body: "Dear Jo,\n\nI would like to submit my piece." }).some((x) => x.level === "warn" && /listen/.test(x.text)), true, "no way to listen is a warning");
eq(pn({ body: "Dear Jo,\n\nI would like to submit.", hasAudioLink: true }).some((x) => /listen/.test(x.text)), false, "an audio attachment counts");
eq(pn({ subject: "x".repeat(80) }).some((x) => x.level === "warn" && /80 characters/.test(x.text)), true, "long subject");
eq(pn({ body: "Dear Jo, " + "word ".repeat(300) + "bandcamp.com please consider" }).some((x) => /300|\d+ words/.test(x.text) && x.level === "warn"), true, "too long");
eq(pn({ body: "Hello there bandcamp.com" }).some((x) => /No clear ask/.test(x.text)), true, "no ask"); eq(pn({ fileBytes: 12 * 1048576 }).some((x) => x.level === "warn" && /MB/.test(x.text)), true, "big files");
eq(words("# Hi\n![pic](/u/a.png)\n@audio(/u/x.mp3)[demo]\n{{first_name}} **bold** text"), 4, "word count ignores markup");
// today
const tc = [C(1, "Due", { followUpAt: "2026-10-01", status: "contacted", sentCount: 1, lastSentAt: "2026-08-01" }), C(2, "Replied", { followUpAt: "2026-10-01", status: "replied" }), C(3, "Soon", { deadline: "2026-10-20" }), C(4, "Far", { deadline: "2027-01-01" }), C(5, "New", { status: "lead" }), C(6, "Grp", { groups: [9] }), C(7, "Past", { deadline: "2026-09-01" })];
const tl = todayLists(tc, "2026-10-12", { group: 9 });
eq(tl.followUps.map((c) => c.id), [1], "follow-ups skip answered people"); eq(tl.deadlines.map((c) => c.id), [3], "deadlines within two weeks"); eq(tl.fresh.map((c) => c.id), [6], "fresh in the chosen group, expired calls excluded");
eq(todayLists(tc, "2026-10-12").fresh.map((c) => c.id), [3, 4, 5, 6], "fresh anywhere, soonest deadline first"); eq(tl.ghostable.map((c) => c.id), [1], "written to 70 days ago, no answer");
eq(followUpDraft({ subject: "Hello", bodyMd: "Line 1\nLine 2", sentAt: "2026-09-01" }).body.endsWith("> Line 1\n> Line 2\n"), true, "quotes the earlier mail"); eq(followUpDraft({ subject: "Re: Hello", bodyMd: "x", sentAt: "d" }).subject, "Re: Hello", "no Re: Re:");
console.log(`outreachUi ok (${n})`);
