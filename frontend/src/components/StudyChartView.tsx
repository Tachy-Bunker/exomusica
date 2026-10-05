import { formatTick, linearTicks, logTicks, parseChartSeries } from "../lib/chartScale";

interface Props {
  kind: "LINE" | "BAR" | "SCATTER" | "TABLE";
  xLabel: string | null;
  yLabel: string | null;
  dataCsv: string;
  xLog?: boolean;
  yLog?: boolean;
}

function parseCsv(csv: string): { headers: string[]; rows: string[][] } {
  const lines = csv
    .trim()
    .split("\n")
    .map((l) => l.split(",").map((c) => c.trim()));
  const [headers, ...rows] = lines;
  return { headers: headers ?? [], rows };
}

const SERIES_COLORS = ["#e2703f", "#4fa8e0", "#5fbf8f", "#c9a7ff", "#d4b13f", "#e07ab8"];

const WIDTH = 640;
const HEIGHT = 320;
const PAD = { top: 20, right: 20, bottom: 44, left: 56 };
const MAX_POINT_MARKERS = 200; // past this a line is just a line - thousands of <circle>s help nobody and cost a lot on weak devices

export function StudyChartView({ kind, xLabel, yLabel, dataCsv, xLog = false, yLog = false }: Props) {
  const { headers, rows } = parseCsv(dataCsv);

  if (kind === "TABLE") {
    return (
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", fontSize: "0.85rem" }}>
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={i} style={{ textAlign: "left", padding: "0.3rem 0.6rem", borderBottom: "1px solid var(--border)" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j} style={{ padding: "0.3rem 0.6rem", borderBottom: "1px solid var(--border)" }}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (headers.length < 2 || rows.length === 0) {
    return <p style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>Not enough data - need a header row plus at least one X column and one Y column.</p>;
  }

  const series = parseChartSeries(headers, rows, SERIES_COLORS);
  if (series.length === 0) {
    return <p style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>No data columns to plot.</p>;
  }

  // X is categorical (evenly spaced) unless every cell is a number.
  const xRaw = rows.map((r) => r[0] ?? "");
  const xIsNumeric = xRaw.every((v) => v !== "" && Number.isFinite(Number(v)));
  const xNum = xIsNumeric ? xRaw.map(Number) : xRaw.map((_, i) => i);

  const notes: string[] = [];
  const xLogActive = xLog && xIsNumeric && kind !== "BAR" && xNum.every((v) => v > 0);
  if (xLog && !xLogActive) notes.push(kind === "BAR" || !xIsNumeric ? "Log X needs a numeric X column - showing linear." : "Log X needs all-positive values - showing linear.");

  // y extents include error bars, so they're never clipped
  const yAll: number[] = [];
  for (const s of series)
    s.values.forEach((v, i) => {
      if (v === null) return;
      const e = s.errors?.[i] ?? 0;
      yAll.push(v, v - (e ?? 0), v + (e ?? 0));
    });
  const yLogActive = yLog && yAll.length > 0 && series.every((s) => s.values.every((v) => v === null || v > 0));
  if (yLog && !yLogActive) notes.push("Log Y needs all-positive values - showing linear.");
  if (yAll.length === 0) return <p style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>No numeric values to plot.</p>;

  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;

  // ---- y scale
  let yMin: number, yMax: number, yTicks: number[], yMinor: number[] = [];
  if (yLogActive) {
    const positive = yAll.filter((v) => v > 0);
    const ls = logTicks(Math.min(...positive), Math.max(...positive));
    yMin = ls.min;
    yMax = ls.max;
    yTicks = ls.major;
    yMinor = ls.minor;
  } else {
    let lo = Math.min(...yAll);
    let hi = Math.max(...yAll);
    if (kind === "BAR") {
      lo = Math.min(0, lo);
      hi = Math.max(0, hi);
    } else {
      // Don't magnify noise: a steady 440.4 Hz that wobbles by 0.1 Hz is a flat line, not a dramatic zigzag.
      const mag = Math.max(Math.abs(lo), Math.abs(hi));
      if (hi - lo < mag * 0.002) {
        const pad = mag > 0 ? mag * 0.01 : 1;
        lo -= pad;
        hi += pad;
      }
    }
    const ls = linearTicks(lo, hi, 5);
    yMin = ls.min;
    yMax = ls.max;
    yTicks = ls.ticks;
  }
  const clampY = (v: number) => Math.max(yMin, Math.min(yMax, v));
  const scaleY = (y: number) => {
    const t = yLogActive ? (Math.log10(clampY(y)) - Math.log10(yMin)) / (Math.log10(yMax) - Math.log10(yMin)) : (clampY(y) - yMin) / (yMax - yMin || 1);
    return PAD.top + plotH - t * plotH;
  };

  // ---- x scale
  let xMin = 0, xMax = 1;
  let xTicks: { v: number; label: string }[] = [];
  let xMinor: number[] = [];
  if (kind === "BAR" || !xIsNumeric) {
    // categorical: one slot per row
    const every = Math.max(1, Math.ceil(rows.length / 8));
    xTicks = xRaw.map((label, i) => ({ v: i, label })).filter((_, i) => i % every === 0);
  } else if (xLogActive) {
    const ls = logTicks(Math.min(...xNum), Math.max(...xNum));
    xMin = ls.min;
    xMax = ls.max;
    xTicks = ls.major.map((v) => ({ v, label: formatTick(v) }));
    xMinor = ls.minor;
  } else {
    const ls = linearTicks(Math.min(...xNum), Math.max(...xNum), 6);
    xMin = ls.min;
    xMax = ls.max;
    xTicks = ls.ticks.map((v) => ({ v, label: formatTick(v) }));
  }
  const categorical = kind === "BAR" || !xIsNumeric;
  const slotW = plotW / rows.length;
  const scaleX = (x: number) => {
    if (categorical) return PAD.left + slotW * (x + 0.5);
    const t = xLogActive ? (Math.log10(x) - Math.log10(xMin)) / (Math.log10(xMax) - Math.log10(xMin)) : (x - xMin) / (xMax - xMin || 1);
    return PAD.left + t * plotW;
  };
  const baselineY = yLogActive ? PAD.top + plotH : scaleY(0);

  const linePath = (values: (number | null)[]) => {
    let d = "";
    let pen = false;
    values.forEach((v, i) => {
      if (v === null) {
        pen = false; // a gap in the data is a gap in the line
        return;
      }
      d += `${pen ? "L" : "M"}${scaleX(xNum[i]).toFixed(1)},${scaleY(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };

  return (
    <div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} style={{ width: "100%", maxWidth: WIDTH, height: "auto" }} role="img" aria-label={`${yLabel ?? "Values"} against ${xLabel ?? "x"}`}>
        {/* gridlines + ticks */}
        {yMinor.map((v) => (
          <line key={`ym${v}`} x1={PAD.left} x2={PAD.left + plotW} y1={scaleY(v)} y2={scaleY(v)} stroke="var(--border)" strokeOpacity={0.25} />
        ))}
        {yTicks.map((v) => (
          <g key={`yt${v}`}>
            <line x1={PAD.left} x2={PAD.left + plotW} y1={scaleY(v)} y2={scaleY(v)} stroke="var(--border)" strokeOpacity={0.55} />
            <text x={PAD.left - 8} y={scaleY(v) + 4} fill="var(--text-dim)" fontSize={10} textAnchor="end">
              {formatTick(v)}
            </text>
          </g>
        ))}
        {xMinor.map((v) => (
          <line key={`xm${v}`} y1={PAD.top} y2={PAD.top + plotH} x1={scaleX(v)} x2={scaleX(v)} stroke="var(--border)" strokeOpacity={0.25} />
        ))}
        {xTicks.map((t, i) => (
          <g key={`xt${i}`}>
            {!categorical && <line y1={PAD.top} y2={PAD.top + plotH} x1={scaleX(t.v)} x2={scaleX(t.v)} stroke="var(--border)" strokeOpacity={0.55} />}
            <text x={scaleX(t.v)} y={PAD.top + plotH + 15} fill="var(--text-dim)" fontSize={10} textAnchor="middle">
              {t.label}
            </text>
          </g>
        ))}
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + plotH} stroke="var(--text-dim)" />
        <line x1={PAD.left} y1={PAD.top + plotH} x2={PAD.left + plotW} y2={PAD.top + plotH} stroke="var(--text-dim)" />
        {yLabel && (
          <text x={14} y={PAD.top + plotH / 2} fill="var(--text-dim)" fontSize={11} textAnchor="middle" transform={`rotate(-90, 14, ${PAD.top + plotH / 2})`}>
            {yLabel}
          </text>
        )}
        {xLabel && (
          <text x={PAD.left + plotW / 2} y={HEIGHT - 6} fill="var(--text-dim)" fontSize={11} textAnchor="middle">
            {xLabel}
          </text>
        )}

        {kind === "BAR" &&
          series.map((s, si) =>
            s.values.map((v, i) => {
              if (v === null) return null;
              const barW = (slotW * 0.7) / series.length;
              const x = PAD.left + i * slotW + slotW * 0.15 + si * barW;
              const top = scaleY(v);
              return <rect key={`${si}-${i}`} x={x} y={Math.min(top, baselineY)} width={barW} height={Math.abs(baselineY - top)} fill={s.color} opacity={0.85} />;
            }),
          )}

        {kind === "LINE" && series.map((s, si) => <path key={si} d={linePath(s.values)} fill="none" stroke={s.color} strokeWidth={2} />)}

        {(kind === "LINE" || kind === "SCATTER") &&
          series.map((s, si) =>
            s.values.map((v, i) => {
              if (v === null) return null;
              if (kind === "LINE" && rows.length > MAX_POINT_MARKERS) return null;
              return (
                <circle key={`${si}-${i}`} cx={scaleX(xNum[i])} cy={scaleY(v)} r={kind === "SCATTER" ? 4 : 2.5} fill={s.color}>
                  <title>{`${s.name}: (${xRaw[i]}, ${v}${s.errors?.[i] != null ? ` ± ${s.errors[i]}` : ""})`}</title>
                </circle>
              );
            }),
          )}

        {/* error bars, drawn for every kind that can carry them */}
        {series.map((s, si) =>
          s.errors
            ? s.values.map((v, i) => {
                const e = s.errors?.[i];
                if (v === null || e == null || e <= 0) return null;
                const x = kind === "BAR" ? PAD.left + i * slotW + slotW * 0.15 + si * ((slotW * 0.7) / series.length) + (slotW * 0.7) / series.length / 2 : scaleX(xNum[i]);
                const y1 = scaleY(v + e);
                const y2 = scaleY(v - e);
                return (
                  <g key={`e${si}-${i}`} stroke={s.color} strokeWidth={1.4}>
                    <line x1={x} x2={x} y1={y1} y2={y2} />
                    <line x1={x - 3.5} x2={x + 3.5} y1={y1} y2={y1} />
                    <line x1={x - 3.5} x2={x + 3.5} y1={y2} y2={y2} />
                  </g>
                );
              })
            : null,
        )}
      </svg>
      {notes.map((n) => (
        <p key={n} style={{ fontSize: "0.72rem", color: "var(--text-dim)", margin: "0.2rem 0 0" }}>
          {n}
        </p>
      ))}
      {series.length > 1 && (
        <div style={{ display: "flex", gap: "0.8rem", fontSize: "0.78rem", marginTop: "0.3rem", flexWrap: "wrap" }}>
          {series.map((s) => (
            <span key={s.name} style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: s.color, display: "inline-block" }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
