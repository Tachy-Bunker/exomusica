import assert from "node:assert/strict";
import { inscriptionParts, inscriptionPlain } from "../src/lib/inscription.js";

const room = "core";
// a Log page and an XenoLab page are links
assert.deepEqual(inscriptionParts("Read [the opening](/wiki/opening) first.", room), [{ text: "Read " }, { label: "the opening", path: "/wiki/opening" }, { text: " first." }]);
assert.deepEqual(inscriptionParts("[XenoLab](/xenolab)", room), [{ label: "XenoLab", path: "/xenolab" }]);
assert.deepEqual(inscriptionParts("[a](/study/s1) and [b](/news/x)", room).filter((p) => "path" in p).map((p) => (p as { path: string }).path), ["/study/s1", "/news/x"]);
// anything the terminal does not show stays as written, and so does a plain text with no link
assert.deepEqual(inscriptionParts("[home](/topic/x) stays", room), [{ text: "[home](/topic/x) stays" }]);
assert.deepEqual(inscriptionParts("[ext](https://example.com)", room), [{ text: "[ext](https://example.com)" }]);
assert.deepEqual(inscriptionParts("no links here", room), [{ text: "no links here" }]);
assert.deepEqual(inscriptionParts("", room), []);
// a broken link (no close paren, empty label) is plain text
assert.deepEqual(inscriptionParts("[open](/wiki/x", room), [{ text: "[open](/wiki/x" }]);
assert.deepEqual(inscriptionParts("[](/wiki/x)", room), [{ text: "[](/wiki/x)" }]);
// two links in a row, and a link at the very end
assert.equal(inscriptionParts("[a](/wiki/a)[b](/wiki/b)", room).length, 2);
// the plain form shows labels
assert.equal(inscriptionPlain("Go to [the Log](/wiki/x). Then [home](/topic/y).", room), "Go to the Log. Then [home](/topic/y).");
console.log("inscription: all passed");
