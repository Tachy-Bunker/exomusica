import assert from "node:assert";
import { feedLead, findPeople, formQuestionsText, looksLikeCall, parseFeed, parseForm, splitNewsletter, teamLinks } from "../src/lib/outreachCollect.js";
import { findPlace, geocode, parseLatLng } from "../src/lib/geo.js";

// Google Form
const data = [null, ["Send us your piece for the 2027 edition. Deadline 2027-03-01.", [
  [11, "Your name", null, 0, [[22, null, 1]]], [12, "Piece description", "max 200 words", 1, [[23, null, 0]]],
  [13, "Format", null, 2, [[24, [["Stereo"], ["Multichannel"], ["Installation"]], 1]]], [14, "", null, 6, null], [15, "Upload", null, 13, [[25, null, 0]]],
]], null, "Sonic Arts Open Call 2027", "x"];
const gf = `<html><script>var FB_PUBLIC_LOAD_DATA_ = ${JSON.stringify(data)};</script></html>`;
const f = parseForm(gf);
assert.equal(f.kind, "google"); assert.equal(f.title, "Sonic Arts Open Call 2027"); assert.equal(f.fields.length, 4);
assert.equal(f.fields[0].required, true); assert.deepEqual(f.fields[2].options, ["Stereo", "Multichannel", "Installation"]); assert.equal(f.fields[3].type, "file upload");
assert.match(formQuestionsText(f), /1\. Your name \* \(short text\)/); assert.match(f.description, /Deadline/);
// brackets inside strings don't break the cutter
const tricky = `<script>FB_PUBLIC_LOAD_DATA_ = ${JSON.stringify([null, ["a ] [ b", [[1, "Q [1] \"x\"", null, 0, [[2, null, 0]]]]], null, "T"])};</script>`;
assert.equal(parseForm(tricky).fields[0].label, 'Q [1] "x"');
// html form
const hf = parseForm(`<title>Apply</title><form action=/s><label for=a>Artist name</label><input id=a name=n required><input type=hidden name=t><textarea name=bio placeholder="Short bio"></textarea><select name=f><option>Stereo</option><option>Quad</option></select><input type=submit></form>`);
assert.equal(hf.kind, "html"); assert.deepEqual(hf.fields.map((x) => x.label), ["Artist name", "Short bio", "f"]); assert.equal(hf.fields[0].required, true); assert.deepEqual(hf.fields[2].options, ["Stereo", "Quad"]);
const search = parseForm(`<title>Site</title><form><input name=q></form>`); assert.equal(search.kind, "unknown");
assert.equal(parseForm("<html>nothing</html>").fields.length, 0);

// newsletter
const nl = `This week in sound\n\nNew Horizons Festival - open call\nSubmit your work for our 2027 edition. Deadline: 2027-02-15. Fee: free. https://newhorizons.example/call\n\nSome unrelated advert for synths https://shop.example\n\nResidency at Atelier Nord\nApply before 2027-04-01 by mailing call@ateliernord.example https://ateliernord.example/res\n\nSee you next week!`;
const calls = splitNewsletter(nl, "2026-10-01");
assert.equal(calls.length, 2, JSON.stringify(calls.map((c) => c.title)));
assert.equal(calls[0].title, "New Horizons Festival - open call"); assert.equal(calls[0].deadline, "2027-02-15"); assert.equal(calls[0].fee, "free"); assert.equal(calls[0].url, "https://newhorizons.example/call");
assert.deepEqual(calls[1].emails, ["call@ateliernord.example"]); assert.equal(calls[1].deadline, "2027-04-01");
assert.equal(splitNewsletter(nl + "\n\n" + nl, "2026-10-01").length, 2);

// feeds
const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>Calls Board</title><item><title>Open call: Spatial audio residency</title><link>https://b.example/1</link><description>&lt;p&gt;Apply by 2027-01-20&lt;/p&gt;</description><pubDate>Mon, 05 Oct 2026 10:00:00 GMT</pubDate></item><item><title>Interview with someone</title><link>https://b.example/2</link><description>Just chat</description></item></channel></rss>`;
const r = parseFeed(rss); assert.equal(r.title, "Calls Board"); assert.equal(r.items.length, 2); assert.equal(looksLikeCall(r.items[0].title, r.items[0].summary), true); assert.equal(looksLikeCall(r.items[1].title, r.items[1].summary), false);
assert.equal(feedLead(r.items[0], "2026-10-01").deadline, "2027-01-20");
const atom = parseFeed(`<feed xmlns="http://www.w3.org/2005/Atom"><title>A</title><entry><title>Call for scores</title><link rel="alternate" href="https://a.example/x"/><summary>Submissions until 2027-05-05</summary></entry></feed>`);
assert.equal(atom.items[0].link, "https://a.example/x"); assert.equal(parseFeed("not xml <<<").items.length, 0);

// people
const ppl = findPeople("Our team\nMarie Dupont, Artistic Director\nmarie@fest.example\nProgrammer: Jean-Luc Martin\nContact — Press");
assert.deepEqual(ppl.map((p) => p.name), ["Marie Dupont", "Jean-Luc Martin"]); assert.equal(ppl[0].email, "marie@fest.example"); assert.match(ppl[0].role, /Artistic Director/i);
assert.deepEqual(teamLinks('<a href="/about">a</a><a href="https://x.com/team">t</a><a href="/news">n</a><a href="/contact#f">c</a>', "https://fest.example/"), ["https://fest.example/about", "https://fest.example/contact"]);

// geo
assert.deepEqual(parseLatLng("48.8566, 2.3522"), { lat: 48.8566, lng: 2.3522 });
assert.deepEqual(parseLatLng("48,8566; 2,3522"), { lat: 48.8566, lng: 2.3522 });
assert.deepEqual(parseLatLng("40.7128 N 74.0060 W"), { lat: 40.7128, lng: -74.006 });
assert.deepEqual(parseLatLng("https://www.google.com/maps/place/X/@52.52,13.405,15z"), { lat: 52.52, lng: 13.405 });
assert.deepEqual(parseLatLng("https://maps.google.com/?q=35.68,139.69"), { lat: 35.68, lng: 139.69 });
assert.deepEqual(parseLatLng("geo:51.5,-0.12"), { lat: 51.5, lng: -0.12 });
const dms = parseLatLng("48°51′24″N 2°21′08″E"); assert.ok(dms && Math.abs(dms.lat - 48.8567) < 1e-3 && Math.abs(dms.lng - 2.3522) < 1e-3);
assert.equal(parseLatLng("Berlin"), null); assert.equal(parseLatLng("95, 10"), null); assert.equal(parseLatLng("0,0"), null);
const pl = findPlace(`<meta name="geo.position" content="52.52;13.405"><meta name="geo.placename" content="Berlin">`, ""); assert.deepEqual(pl, { place: "Berlin", lat: 52.52, lng: 13.405 });
const ld = findPlace(`<script type="application/ld+json">{"@type":"Event","location":{"name":"Kunsthalle","address":{"addressLocality":"Basel","addressCountry":"CH"}}}</script>`, ""); assert.equal(ld.place, "Kunsthalle, Basel, CH");
assert.equal(findPlace("", "Intro\nLocation: Lyon, France\nmore").place, "Lyon, France");
let calls2 = 0;
const fake = (async () => { calls2++; return { ok: true, json: async () => [{ lat: "45.76", lon: "4.83", display_name: "Lyon, France" }] }; }) as unknown as typeof fetch;
const g1 = await geocode("Lyon", fake), g2 = await geocode("  lyon ", fake); assert.equal(g1?.lat, 45.76); assert.equal(calls2, 1); assert.deepEqual(g2, g1);
assert.equal((await geocode("12.5, 41.9", fake))?.lng, 41.9); assert.equal(calls2, 1);
console.log("outreachcollect ok");
