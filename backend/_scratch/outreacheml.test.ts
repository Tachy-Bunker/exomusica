import assert from "node:assert";
import { classifyMail, cleanMessageId, emlFileName, mailHint, type MailFacts } from "../src/lib/outreachEml.js";
const base: MailFacts = { fromEmail: "", fromName: "", toEmails: [], subject: "", text: "", hasListUnsubscribe: false, automated: false, inReplyTo: null, references: [], own: new Set(["me@tachy.example"]), known: new Set(["prog@fest.example"]), knownDomains: new Set(["fest.example"]), sentIds: new Set(["<sent1@tachy.example>"]) };
const v = (o: Partial<MailFacts>) => classifyMail({ ...base, ...o });
// my pitch to a festival
let r = v({ fromEmail: "me@tachy.example", toEmails: ["booking@newfest.example"], subject: "Submission: electroacoustic piece for your festival", text: "Hello, I am a composer. My music is here: https://x.bandcamp.com" });
assert.equal(r.direction, "out"); assert.equal(r.counterparty, "booking@newfest.example"); assert.equal(r.kind, "application");
// a reply in a thread I started
r = v({ fromEmail: "prog@fest.example", fromName: "Marie", toEmails: ["me@tachy.example"], subject: "Re: Hi", text: "Thanks!", inReplyTo: "<sent1@tachy.example>" });
assert.equal(r.direction, "in"); assert.equal(r.kind, "application"); assert.equal(r.counterpartyName, "Marie");
// a decline
r = v({ fromEmail: "prog@fest.example", toEmails: ["me@tachy.example"], subject: "Your submission", text: "Unfortunately your piece was not selected this year." });
assert.equal(r.kind, "application"); assert.equal(r.hint, "decline");
assert.equal(mailHint("We are pleased to inform you that you have been selected"), "acceptance"); assert.equal(mailHint("Thank you for your submission"), "confirmation"); assert.equal(mailHint("not selected, but congratulations on the work"), "decline"); assert.equal(mailHint("lunch?"), null);
// strays
r = v({ fromEmail: "no-reply@shop.example", toEmails: ["me@tachy.example"], subject: "Your order has shipped", text: "Tracking number 123" }); assert.equal(r.kind, "stray");
r = v({ fromEmail: "news@e.store.example", toEmails: ["me@tachy.example"], subject: "20% off sale", text: "festival season deals!", hasListUnsubscribe: true }); assert.equal(r.kind, "stray");
r = v({ fromEmail: "notification@facebookmail.com", toEmails: ["me@tachy.example"], subject: "You have a new follower", text: "see profile" }); assert.equal(r.kind, "stray");
r = v({ fromEmail: "friend@gmail.com", toEmails: ["me@tachy.example"], subject: "Dinner Saturday?", text: "Are you free?" }); assert.equal(r.kind, "stray"); assert.match(r.reason, /unrelated/);
// automatic confirmation from a form tool still counts
r = v({ fromEmail: "noreply@submittable.example", toEmails: ["me@tachy.example"], subject: "Thank you for applying to Sonic Residency 2027", text: "We have received your application. Our jury will review." }); assert.equal(r.kind, "application"); assert.equal(r.hint, "confirmation");
// a known contact writing about anything
r = v({ fromEmail: "prog@fest.example", toEmails: ["me@tachy.example"], subject: "quick question", text: "do you have a bio?" }); assert.equal(r.kind, "application");
assert.equal(cleanMessageId(" <A.B@Host> "), "<a.b@host>"); assert.equal(cleanMessageId("junk"), null);
assert.equal(emlFileName(new Date("2026-03-04T10:00:00Z"), "Re: Café — Open Call!", "m12"), "2026-03-04_re-cafe-open-call_m12.eml");
console.log("outreacheml ok");
