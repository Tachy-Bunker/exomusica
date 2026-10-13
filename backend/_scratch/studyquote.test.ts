import assert from "node:assert/strict";
import { quoteBlock, cleanQuoteText } from "../src/lib/studyQuote";
assert.equal(quoteBlock("  ", "a", "b", null), null);
assert.equal(quoteBlock("hi\nthere", "tachy", "The Hall", "https://x.org/topic/hall#m-9"), "\n\n> hi\n> there\n> — tachy, [The Hall](https://x.org/topic/hall#m-9)\n");
assert.equal(quoteBlock("hi", "ta[c]hy", "x", "javascript:alert(1)"), "\n\n> hi\n> — ta c hy\n");
assert.equal(cleanQuoteText("a <@123> b\u0000"), "a @… b");
assert.equal(cleanQuoteText("x".repeat(5000)).length, 1200);
assert.ok(quoteBlock("a", undefined, undefined, "https://x.org/a)b")!.includes("— someone\n"));
console.log("studyquote ok");
