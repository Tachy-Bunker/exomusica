import { chartPalette, chartAccent, luminance, hexToRgb, LUMINANCE_FLOOR } from "../src/lib/chartPalette";
let bad = 0; const ck = (c: boolean, m: string) => { if (!c) bad++; console.log(c ? "ok  " : "FAIL", m); };
const lum = (h: string) => luminance(hexToRgb(h)!);
for (const base of ["#000000", "#0a0a14", "#202020", "#3a1010", "#103a10", "#10103a", "#ffffff", "#e0c080", "#808080"]) {
  const pal = chartPalette(base, 6);
  ck(pal.length === 6 && pal.every((c) => lum(c) >= LUMINANCE_FLOOR - 0.005), `${base}: six colours, all above the floor (min ${Math.min(...pal.map(lum)).toFixed(3)})`);
  ck(new Set(pal).size === 6, `${base}: all different`);
}
ck(chartPalette(null, 3).length === 0, "no picture: empty (the default palette applies)");
ck(chartPalette("nonsense", 3).length === 0, "bad colour: empty");
ck(chartAccent("#103a10") !== null, "accent exists");
const red = hexToRgb(chartAccent("#a01010")!)!; ck(red[0] > red[1] && red[0] > red[2], "a red picture gives a reddish accent");
ck(chartPalette("#a01010", 9).length === 9, "more series than offsets still works");
process.exit(bad ? 1 : 0);
