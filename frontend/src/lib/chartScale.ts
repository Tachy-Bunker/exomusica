// Pure scale/tick/series logic for study charts, kept separate from the SVG
// so it can be tested without a browser.

export interface LinearScale {
  min: number;
  max: number;
  ticks: number[];
}

/** Heckbert's "nice numbers": a step of 1, 2, 5 or 10 times a power of ten. */
function niceNumber(range: number, round: boolean): number {
  const exp = Math.floor(Math.log10(range));
  const f = range / Math.pow(10, exp);
  let nf: number;
  if (round) nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
  else nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nf * Math.pow(10, exp);
}

const clean = (v: number) => Number(v.toPrecision(12)); // 0.1+0.2 -> 0.3

/** Round-number ticks that fully cover [min, max]. */
export function linearTicks(min: number, max: number, target = 5): LinearScale {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1, ticks: [0, 0.5, 1] };
  if (min === max) {
    const pad = Math.abs(min) || 1;
    min -= pad * 0.5;
    max += pad * 0.5;
  }
  const range = niceNumber(max - min, false);
  const step = niceNumber(range / Math.max(1, target - 1), true);
  const lo = Math.floor(min / step + 1e-9) * step;
  const hi = Math.ceil(max / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step * 0.5; v += step) ticks.push(clean(v));
  return { min: ticks[0], max: ticks[ticks.length - 1], ticks };
}

export interface LogScale {
  min: number;
  max: number;
  /** Decades: 1, 10, 100 ... */
  major: number[];
  /** 2x and 5x within each decade, for readable intermediate marks. */
  minor: number[];
}

/** Decade-snapped ticks. Inputs must be > 0. */
export function logTicks(min: number, max: number): LogScale {
  let lo = Math.floor(Math.log10(min) + 1e-9);
  let hi = Math.ceil(Math.log10(max) - 1e-9);
  if (hi <= lo) hi = lo + 1;
  const major: number[] = [];
  const minor: number[] = [];
  for (let d = lo; d <= hi; d++) {
    major.push(clean(Math.pow(10, d)));
    if (d < hi) {
      minor.push(clean(2 * Math.pow(10, d)));
      minor.push(clean(5 * Math.pow(10, d)));
    }
  }
  return { min: major[0], max: major[major.length - 1], major, minor };
}

/** Compact, unambiguous tick labels: 1k, 2.5M, 0.25, 1e-4. */
export function formatTick(v: number): string {
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a >= 1e6) return `${clean(v / 1e6)}M`;
  if (a >= 1e3) return `${clean(v / 1e3)}k`;
  if (a < 1e-3) return v.toExponential(0).replace("e-", "e-").replace("e+", "e");
  return String(clean(v));
}

export interface ChartSeries {
  name: string;
  color: string;
  /** One entry per row, null where the cell is empty or not a number, so points never drift out of line with their x. */
  values: (number | null)[];
  /** Symmetric error per row, from a "<name>_err" or "<name>±" column. */
  errors: (number | null)[] | null;
}

function toNumber(cell: string | undefined): number | null {
  if (cell === undefined || cell.trim() === "") return null; // Number("") is 0 - an empty cell is not a zero
  const n = Number(cell);
  return Number.isFinite(n) ? n : null;
}

/**
 * Turns CSV columns into series. A column named "gain_err" (or "gain±", or
 * "±gain") whose base column "gain" exists becomes that series' error bars
 * instead of being plotted as a series of its own.
 */
export function parseChartSeries(headers: string[], rows: string[][], colors: string[]): ChartSeries[] {
  const base = new Map<string, number>(); // lowercased header -> column index
  headers.forEach((h, i) => {
    if (i > 0) base.set(h.trim().toLowerCase(), i);
  });
  const errorColumnOf = new Map<number, number>(); // base column -> error column
  const isErrorColumn = new Set<number>();
  headers.forEach((h, i) => {
    if (i === 0) return;
    const name = h.trim();
    const m = name.match(/^(.+?)(?:_err|\s*±)$/i) ?? name.match(/^±\s*(.+)$/);
    if (!m) return;
    const baseIndex = base.get(m[1].trim().toLowerCase());
    if (baseIndex !== undefined && baseIndex !== i) {
      errorColumnOf.set(baseIndex, i);
      isErrorColumn.add(i);
    }
  });
  const out: ChartSeries[] = [];
  headers.forEach((h, i) => {
    if (i === 0 || isErrorColumn.has(i)) return;
    const errCol = errorColumnOf.get(i);
    out.push({
      name: h.trim(),
      color: colors[out.length % colors.length],
      values: rows.map((r) => toNumber(r[i])),
      errors: errCol === undefined ? null : rows.map((r) => toNumber(r[errCol])),
    });
  });
  return out;
}
