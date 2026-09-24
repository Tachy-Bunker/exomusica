import { useState } from "react";

interface Props {
  genres: string[];
  useCustom: boolean;
  customColors: Record<string, string>;
  onSave: (useCustom: boolean, customColors: Record<string, string>) => void;
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x: number) =>
    Math.round(x * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

export function VennCustomColorEditor({ genres, useCustom, customColors, onSave }: Props) {
  const [hexDrafts, setHexDrafts] = useState<Record<string, string>>({});

  function setColor(genre: string, hex: string) {
    onSave(useCustom, { ...customColors, [genre]: hex });
  }

  function makePalette() {
    const next: Record<string, string> = { ...customColors };
    genres.forEach((g, i) => {
      next[g] = hslToHex((i / Math.max(1, genres.length)) * 360, 65, 58);
    });
    onSave(true, next);
  }

  return (
    <div className="field" style={{ borderTop: "1px solid var(--border)", paddingTop: "0.5rem", marginTop: "0.3rem" }}>
      <label style={{ fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
        <input type="checkbox" checked={useCustom} onChange={(e) => onSave(e.target.checked, customColors)} />
        Custom genre colors
      </label>

      {useCustom && (
        <div style={{ marginTop: "0.4rem" }}>
          <button className="btn" style={{ fontSize: "0.72rem", marginBottom: "0.4rem" }} onClick={makePalette}>
            🎨 Make a palette for me
          </button>
          <div style={{ maxHeight: 220, overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            {genres.map((g) => {
              const current = customColors[g] ?? "#8fb8ff";
              const draft = hexDrafts[g] ?? current;
              return (
                <div key={g} style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                  <input type="color" value={/^#[0-9a-f]{6}$/i.test(current) ? current : "#8fb8ff"} onChange={(e) => setColor(g, e.target.value)} style={{ width: 26, height: 22, padding: 0, border: "none" }} />
                  <input
                    value={draft}
                    onChange={(e) => setHexDrafts((d) => ({ ...d, [g]: e.target.value }))}
                    onBlur={() => {
                      if (/^#?[0-9a-f]{6}$/i.test(draft)) setColor(g, draft.startsWith("#") ? draft : `#${draft}`);
                    }}
                    placeholder="#hex"
                    style={{ width: 72, fontSize: "0.72rem" }}
                  />
                  <span style={{ fontSize: "0.72rem", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
