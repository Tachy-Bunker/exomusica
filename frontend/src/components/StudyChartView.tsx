interface Props {
  kind: "LINE" | "BAR" | "SCATTER" | "TABLE";
  xLabel: string | null;
  yLabel: string | null;
  dataCsv: string;
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

export function StudyChartView({ kind, xLabel, yLabel, dataCsv }: Props) {
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

  const seriesNames = headers.slice(1);
  // X is treated as categorical (evenly spaced) unless every value in
  // that column parses as a number, in which case it's plotted on a
  // real numeric scale - covers both "date/label per row" and "a real
  // independent variable" cases without the author needing to say which.
  const xValuesRaw = rows.map((r) => r[0]);
  const xIsNumeric = xValuesRaw.every((v) => v !== "" && !isNaN(Number(v)));
  const xNumeric = xIsNumeric ? xValuesRaw.map(Number) : xValuesRaw.map((_, i) => i);
  const xMin = Math.min(...xNumeric);
  const xMax = Math.max(...xNumeric);

  const series = seriesNames.map((name, si) => ({
    name,
    color: SERIES_COLORS[si % SERIES_COLORS.length],
    values: rows.map((r) => Number(r[si + 1])).filter((v) => !isNaN(v)),
  }));
  const allValues = series.flatMap((s) => s.values);
  const yMin = Math.min(0, ...allValues);
  const yMax = Math.max(...allValues, 1);

  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const scaleX = (x: number) => PAD.left + (xMax === xMin ? plotW / 2 : ((x - xMin) / (xMax - xMin)) * plotW);
  const scaleY = (y: number) => PAD.top + plotH - ((y - yMin) / (yMax - yMin || 1)) * plotH;

  return (
    <div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} style={{ width: "100%", maxWidth: WIDTH, height: "auto" }}>
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + plotH} stroke="var(--border)" />
        <line x1={PAD.left} y1={PAD.top + plotH} x2={PAD.left + plotW} y2={PAD.top + plotH} stroke="var(--border)" />
        {yLabel && (
          <text x={14} y={PAD.top + plotH / 2} fill="var(--text-dim)" fontSize={11} textAnchor="middle" transform={`rotate(-90, 14, ${PAD.top + plotH / 2})`}>
            {yLabel}
          </text>
        )}
        {xLabel && (
          <text x={PAD.left + plotW / 2} y={HEIGHT - 8} fill="var(--text-dim)" fontSize={11} textAnchor="middle">
            {xLabel}
          </text>
        )}
        {[yMin, (yMin + yMax) / 2, yMax].map((v, i) => (
          <text key={i} x={PAD.left - 8} y={scaleY(v) + 4} fill="var(--text-dim)" fontSize={10} textAnchor="end">
            {v.toFixed(v % 1 === 0 ? 0 : 1)}
          </text>
        ))}

        {kind === "BAR" &&
          series.map((s, si) =>
            s.values.map((v, i) => {
              const barGroupW = plotW / rows.length;
              const barW = (barGroupW * 0.7) / series.length;
              const x = PAD.left + i * barGroupW + barGroupW * 0.15 + si * barW;
              const y = scaleY(Math.max(v, 0));
              const h = Math.abs(scaleY(v) - scaleY(0));
              return <rect key={`${si}-${i}`} x={x} y={v >= 0 ? y : scaleY(0)} width={barW} height={h} fill={s.color} opacity={0.85} />;
            }),
          )}

        {kind === "LINE" &&
          series.map((s, si) => (
            <polyline
              key={si}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              points={s.values.map((v, i) => `${scaleX(xNumeric[i])},${scaleY(v)}`).join(" ")}
            />
          ))}

        {(kind === "LINE" || kind === "SCATTER") &&
          series.map((s, si) =>
            s.values.map((v, i) => <circle key={`${si}-${i}`} cx={scaleX(xNumeric[i])} cy={scaleY(v)} r={kind === "SCATTER" ? 4 : 2.5} fill={s.color} />),
          )}
      </svg>
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
