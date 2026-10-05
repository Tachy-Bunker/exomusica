import qrcode from "qrcode-generator";

// QR codes with a logo in the middle and a picture behind them. The risk with a
// styled code is that it stops scanning, so the layout is computed (not eyeballed):
// error correction is the maximum (H, ~30% recoverable), the logo is kept to a small
// share of the code's area, and a light plate keeps the modules readable on top of any
// background. The same layout drives both the canvas and SVG renderers.

export interface QrStyle {
  /** Output size in px (square). */
  size?: number;
  dark?: string;
  light?: string;
  /** Colour of the default Exomusica mark. */
  accent?: string;
  /** A picture behind the code, drawn "cover". */
  background?: CanvasImageSource | null;
  /** How much the background is darkened, 0-1, so it doesn't compete with the code. */
  backgroundDim?: number;
  /** "default" = the Exomusica mark; an image = a custom logo; null/undefined = none. */
  logo?: CanvasImageSource | "default" | null;
  /** Logo width as a share of the code's width. Clamped so the logo never covers too much. */
  logoScale?: number;
  /** Opacity of the light plate under the code (higher = easier to scan on a busy background). */
  plateOpacity?: number;
  /** Rounded modules (finder patterns always stay square). */
  rounded?: boolean;
}

export const QR_DEFAULTS = { size: 512, dark: "#0d0f1a", light: "#ffffff", accent: "#e2703f", backgroundDim: 0.35, logoScale: 0.2, plateOpacity: 0.93, rounded: true } as const;

/** Never let the logo hide more than this share of the code's modules (error correction H repairs ~30%; this leaves a wide margin for dirt, glare and print). */
export const MAX_COVERED_SHARE = 0.12;

export function qrModules(text: string): boolean[][] {
  const qr = qrcode(0, "H"); // type 0 = smallest version that fits; H = highest error correction
  qr.addData(text, "Byte");
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}

export interface QrLayout {
  size: number;
  count: number;
  /** The light plate behind the code, in px. */
  plate: { x: number; y: number; w: number; r: number };
  module: number;
  origin: { x: number; y: number };
  /** The logo's badge (a rounded square cleared of modules), or null when there is no logo. */
  badge: { x: number; y: number; w: number; r: number } | null;
  cleared: (row: number, col: number) => boolean;
  clearedShare: number;
}

const QUIET_MODULES = 4; // the quiet zone the QR standard asks for, kept on the light plate

export function layoutQr(count: number, size: number, hasLogo: boolean, logoScale: number): QrLayout {
  // A whole number of pixels per module: fractional module sizes make some modules wider than others,
  // which blurs the grid for a decoder (and for a printer). The plate is centred, so the picture behind
  // shows evenly around it.
  const available = size * 0.88;
  const module = Math.max(1, Math.floor(available / (count + 2 * QUIET_MODULES)));
  const plateW = module * (count + 2 * QUIET_MODULES);
  const frame = Math.floor((size - plateW) / 2);
  const origin = { x: frame + QUIET_MODULES * module, y: frame + QUIET_MODULES * module };
  const plate = { x: frame, y: frame, w: plateW, r: size * 0.04 };
  const isFinder = (r: number, c: number) => (r < 8 && c < 8) || (r < 8 && c >= count - 8) || (r >= count - 8 && c < 8);

  let badge: QrLayout["badge"] = null;
  let cleared = (_r: number, _c: number) => false;
  let share = 0;
  if (hasLogo) {
    // shrink the logo until it covers a safe share of modules
    let scale = Math.min(Math.max(logoScale, 0.06), 0.26);
    for (let guard = 0; guard < 40; guard++) {
      const side = Math.ceil(scale * count) + 2; // modules cleared, odd/even handled by centring below
      const lo = Math.floor((count - side) / 2);
      const hi = lo + side - 1;
      const covers = (r: number, c: number) => r >= lo && r <= hi && c >= lo && c <= hi && !isFinder(r, c);
      let n = 0;
      for (let r = lo; r <= hi; r++) for (let c = lo; c <= hi; c++) if (covers(r, c)) n++;
      share = n / (count * count);
      if (share <= MAX_COVERED_SHARE || scale <= 0.06) {
        cleared = covers;
        badge = { x: origin.x + lo * module, y: origin.y + lo * module, w: side * module, r: module * 1.2 };
        break;
      }
      scale *= 0.92;
    }
  }
  return { size, count, plate, module, origin, badge, cleared, clearedShare: share };
}

export const isFinderModule = (count: number, r: number, c: number) => (r < 7 && c < 7) || (r < 7 && c >= count - 7) || (r >= count - 7 && c < 7);

// -------------------------------------------------------- the Exomusica mark

/** Two mirrored "≤ ≥" chevrons, echoing the ⩽ Exomusica ⪖ wordmark. Drawn in a 0-100 box. */
export const MARK_PATHS = ["M41 24 L15 46 L41 68", "M15 80 L41 63", "M59 24 L85 46 L59 68", "M85 80 L59 63"];

function drawMark(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(w / 100, w / 100);
  ctx.strokeStyle = color;
  ctx.lineWidth = 11;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const d of MARK_PATHS) ctx.stroke(new Path2D(d));
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, w, r);
}

function drawCover(ctx: CanvasRenderingContext2D, img: CanvasImageSource, size: number) {
  const iw = (img as HTMLImageElement).naturalWidth || (img as ImageBitmap).width || size;
  const ih = (img as HTMLImageElement).naturalHeight || (img as ImageBitmap).height || size;
  const k = Math.max(size / iw, size / ih);
  ctx.drawImage(img, (size - iw * k) / 2, (size - ih * k) / 2, iw * k, ih * k);
}

/** Draws the styled code onto a canvas and returns its layout (for tests and for sizing UI around it). */
export function drawQr(canvas: HTMLCanvasElement, text: string, style: QrStyle = {}): QrLayout {
  const s = { ...QR_DEFAULTS, ...style };
  const modules = qrModules(text);
  const layout = layoutQr(modules.length, s.size, !!style.logo, s.logoScale);
  canvas.width = s.size;
  canvas.height = s.size;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, s.size, s.size);

  if (style.background) {
    drawCover(ctx, style.background, s.size);
    ctx.fillStyle = `rgba(0,0,0,${s.backgroundDim})`;
    ctx.fillRect(0, 0, s.size, s.size);
  } else {
    ctx.fillStyle = s.light; // no picture: the whole canvas is the light plate colour, so the quiet zone is generous
    ctx.fillRect(0, 0, s.size, s.size);
  }

  // light plate, so the modules always sit on a calm surface whatever is behind
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = s.size * 0.02;
  ctx.fillStyle = hexToRgba(s.light, s.plateOpacity);
  roundRect(ctx, layout.plate.x, layout.plate.y, layout.plate.w, layout.plate.r);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = s.dark;
  const m = layout.module;
  for (let r = 0; r < layout.count; r++) {
    for (let c = 0; c < layout.count; c++) {
      if (!modules[r][c] || layout.cleared(r, c)) continue;
      const x = layout.origin.x + c * m;
      const y = layout.origin.y + r * m;
      if (s.rounded && !isFinderModule(layout.count, r, c)) {
        ctx.beginPath();
        ctx.roundRect(x, y, m, m, m * 0.32);
        ctx.fill();
      } else {
        ctx.fillRect(Math.floor(x), Math.floor(y), Math.ceil(m) + 0.5, Math.ceil(m) + 0.5); // no hairline gaps between square modules
      }
    }
  }

  if (layout.badge && style.logo) {
    const b = layout.badge;
    ctx.fillStyle = s.light;
    roundRect(ctx, b.x, b.y, b.w, b.r);
    ctx.fill();
    const inner = b.w * 0.82;
    const ix = b.x + (b.w - inner) / 2;
    const iy = b.y + (b.w - inner) / 2;
    if (style.logo === "default") drawMark(ctx, ix, iy, inner, s.accent);
    else ctx.drawImage(style.logo, ix, iy, inner, inner);
  }
  return layout;
}

function hexToRgba(hex: string, alpha: number): string {
  const m = hex.replace("#", "");
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** Vector version for print (the book). The background picture is embedded when a data URL is supplied. */
export function qrToSvg(text: string, style: Omit<QrStyle, "background" | "logo"> & { backgroundDataUrl?: string | null; logoDataUrl?: string | null; useDefaultLogo?: boolean } = {}): string {
  const s = { ...QR_DEFAULTS, ...style };
  const modules = qrModules(text);
  const hasLogo = !!style.useDefaultLogo || !!style.logoDataUrl;
  const L = layoutQr(modules.length, s.size, hasLogo, s.logoScale);
  const m = L.module;
  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${s.size} ${s.size}" width="${s.size}" height="${s.size}">`);
  parts.push(style.backgroundDataUrl ? `<image href="${style.backgroundDataUrl}" width="${s.size}" height="${s.size}" preserveAspectRatio="xMidYMid slice"/><rect width="${s.size}" height="${s.size}" fill="#000" opacity="${s.backgroundDim}"/>` : `<rect width="${s.size}" height="${s.size}" fill="${s.light}"/>`);
  parts.push(`<rect x="${L.plate.x}" y="${L.plate.y}" width="${L.plate.w}" height="${L.plate.w}" rx="${L.plate.r}" fill="${s.light}" opacity="${s.plateOpacity}"/>`);
  let d = "";
  for (let r = 0; r < L.count; r++)
    for (let c = 0; c < L.count; c++) {
      if (!modules[r][c] || L.cleared(r, c)) continue;
      d += `M${(L.origin.x + c * m).toFixed(2)} ${(L.origin.y + r * m).toFixed(2)}h${(m + 0.05).toFixed(2)}v${(m + 0.05).toFixed(2)}h${(-(m + 0.05)).toFixed(2)}z`;
    }
  parts.push(`<path d="${d}" fill="${s.dark}"/>`);
  if (L.badge && hasLogo) {
    const b = L.badge;
    const inner = b.w * 0.82;
    const ix = b.x + (b.w - inner) / 2;
    const iy = b.y + (b.w - inner) / 2;
    parts.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.w}" rx="${b.r}" fill="${s.light}"/>`);
    if (style.logoDataUrl) parts.push(`<image href="${style.logoDataUrl}" x="${ix}" y="${iy}" width="${inner}" height="${inner}"/>`);
    else parts.push(`<g transform="translate(${ix} ${iy}) scale(${inner / 100})" fill="none" stroke="${s.accent}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round">${MARK_PATHS.map((p) => `<path d="${p}"/>`).join("")}</g>`);
  }
  parts.push("</svg>");
  return parts.join("");
}
