// Building a sky panorama (2:1) from skybox files: six faces of a cube, or one wide picture.
export type Role = "front" | "back" | "left" | "right" | "up" | "down";
export const ROLES: Role[] = ["front", "back", "left", "right", "up", "down"];
const TOKENS: Record<string, Role> = {
  front: "front", ft: "front", nz: "front", negz: "front", back: "back", bk: "back", pz: "back", posz: "back",
  right: "right", rt: "right", px: "right", posx: "right", left: "left", lf: "left", nx: "left", negx: "left",
  up: "up", top: "up", py: "up", posy: "up", down: "down", dn: "down", bottom: "down", bot: "down", ny: "down", negy: "down",
};
/** Which face a file is, from its name (front/back/left/right/up/down, ft/bk/lf/rt/up/dn, px/nx/py/ny/pz/nz...). */
export function roleOf(file: string): Role | null {
  const base = (file.split("/").pop() ?? file).replace(/\.[^.]+$/, "").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  const toks = base.split(/[^a-z0-9]+/).filter(Boolean);
  for (let i = toks.length - 1; i >= 0; i--) if (TOKENS[toks[i]]) return TOKENS[toks[i]];
  return null;
}
/** The face and the (s, t) in 0..1 (t down the picture) that a direction looks at. World: x right, y up, front is -z. */
export function facePick(x: number, y: number, z: number, out: { role: Role; s: number; t: number }): void {
  const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z); let sc: number, tc: number, ma: number;
  if (az >= ax && az >= ay) { ma = az; tc = -y; if (z < 0) { out.role = "front"; sc = x; } else { out.role = "back"; sc = -x; } }
  else if (ax >= ay) { ma = ax; tc = -y; if (x > 0) { out.role = "right"; sc = z; } else { out.role = "left"; sc = -z; } }
  else if (y > 0) { ma = ay; out.role = "up"; sc = x; tc = z; }
  else { ma = ay; out.role = "down"; sc = x; tc = -z; }
  out.s = (sc / ma + 1) / 2; out.t = (tc / ma + 1) / 2;
}
const W = 1024, H = 512;
/** Six faces (at least the four sides) into one 1024 x 512 panorama canvas. */
export function composeCube(faces: Partial<Record<Role, ImageBitmap>>): HTMLCanvasElement {
  const px: Partial<Record<Role, ImageData>> = {}; let fs = 0;
  for (const r of ROLES) { const b = faces[r]; if (!b) continue; const c = document.createElement("canvas"); c.width = c.height = 512; const g = c.getContext("2d")!; g.drawImage(b, 0, 0, 512, 512); px[r] = g.getImageData(0, 0, 512, 512); fs = 512; }
  const out = document.createElement("canvas"); out.width = W; out.height = H; const og = out.getContext("2d")!, img = og.createImageData(W, H), d = img.data, pk = { role: "front" as Role, s: 0, t: 0 };
  for (let j = 0; j < H; j++) {
    const el = (0.5 - (j + 0.5) / H) * Math.PI, ce = Math.cos(el), y = Math.sin(el);
    for (let i = 0; i < W; i++) {
      const az = ((i + 0.5) / W - 0.5) * Math.PI * 2; facePick(Math.sin(az) * ce, y, -Math.cos(az) * ce, pk);
      const f = px[pk.role], o = (j * W + i) * 4; d[o + 3] = 255;
      if (!f) { d[o] = 4; d[o + 1] = 6; d[o + 2] = 12; continue; }
      const sx = Math.min(fs - 1, (pk.s * fs) | 0), sy = Math.min(fs - 1, (pk.t * fs) | 0), q = (sy * fs + sx) * 4;
      d[o] = f.data[q]; d[o + 1] = f.data[q + 1]; d[o + 2] = f.data[q + 2];
    }
  }
  og.putImageData(img, 0, 0); return out;
}
/** One wide picture as a 1024 x 512 panorama (stretched to 2:1). */
export function panoOf(b: ImageBitmap): HTMLCanvasElement { const c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d")!; g.imageSmoothingQuality = "high"; g.drawImage(b, 0, 0, W, H); return c; }
export const MAX_SKY_B64 = 380_000;
/** JPEG data URL, redrawn at 512 x 256 if the full size is too heavy for the server. */
export function skyUrl(c: HTMLCanvasElement): string {
  let url = c.toDataURL("image/jpeg", 0.82);
  if (url.length > MAX_SKY_B64) { const s = document.createElement("canvas"); s.width = 512; s.height = 256; s.getContext("2d")!.drawImage(c, 0, 0, 512, 256); url = s.toDataURL("image/jpeg", 0.8); }
  return url;
}
