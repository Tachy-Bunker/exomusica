import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { FX_DEFAULTS, type FxSettings } from "../../lib/entoptic/useSpacemapField";

const SLIDERS: { key: keyof FxSettings; label: string; min: number; max: number; step: number }[] = [
  { key: "spacingMultiplier", label: "Spacing between entities", min: 0.5, max: 3, step: 0.05 },
  { key: "debrisCount", label: "Debris", min: 10, max: 1500, step: 1 },
  { key: "wardenSizeMin", label: "Warden size (min)", min: 8, max: 100, step: 1 },
  { key: "wardenSizeMax", label: "Warden size (max)", min: 8, max: 100, step: 1 },
  { key: "split", label: "Chromatic split", min: 0, max: 1, step: 0.01 },
  { key: "chaos", label: "Fold chaos", min: 0, max: 1, step: 0.01 },
  { key: "drift", label: "Drift speed", min: 0, max: 1, step: 0.01 },
  { key: "lurk", label: "Lurker", min: 0, max: 1, step: 0.01 },
  { key: "bgBright", label: "Bg brightness", min: 0, max: 1, step: 0.01 },
  { key: "rmsBrightnessAmount", label: "Bg brightness reactivity to audio (RMS)", min: 0, max: 1, step: 0.01 },
  { key: "bgSat", label: "Bg saturation", min: 0, max: 1, step: 0.01 },
  { key: "bgContrast", label: "Bg contrast", min: 0, max: 1, step: 0.01 },
  { key: "vignette", label: "Vignette", min: 0, max: 1, step: 0.01 },
  { key: "wardenHue", label: "Warden hue", min: 0, max: 360, step: 1 },
  { key: "trailAmt", label: "Warden trail", min: 0, max: 1, step: 0.01 },
  { key: "wardenReveal", label: "Warden reveal", min: 0, max: 1, step: 0.01 },
  { key: "wardenHuskBright", label: "Husk brightness", min: 0, max: 1, step: 0.01 },
  { key: "wardenOrbBright", label: "Orb brightness", min: 0, max: 1, step: 0.01 },
  { key: "glowHue", label: "Glow hue", min: 0, max: 360, step: 1 },
  { key: "glowSat", label: "Glow saturation", min: 0, max: 1, step: 0.01 },
  { key: "glowBright", label: "Glow brightness", min: 0, max: 1, step: 0.01 },
];

export function FxSettingsAdminPage() {
  const [settings, setSettings] = useState<FxSettings>(FX_DEFAULTS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api<FxSettings>("/api/fx-settings").then(setSettings);
  }, []);

  function update(key: keyof FxSettings, value: number) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    await api("/api/admin/fx-settings", { method: "PUT", body: JSON.stringify(settings) });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div>
      <h1>Spacemap field</h1>
      <p style={{ color: "var(--text-dim)", maxWidth: 500 }}>
        Controls for the Entoptic Cemetery background — the fold/interference field, wardens, static, and
        chromatic aberration on the homepage spacemap. Changes apply site-wide for every visitor.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "0.8rem", maxWidth: 900 }}>
        {SLIDERS.map((s) => (
          <div className="field" key={s.key}>
            <label>
              {s.label} — {settings[s.key]}
            </label>
            <input
              type="range"
              min={s.min}
              max={s.max}
              step={s.step}
              value={settings[s.key]}
              onChange={(e) => update(s.key, Number(e.target.value))}
            />
          </div>
        ))}
      </div>
      <button className="btn btn-primary" style={{ marginTop: "1rem" }} onClick={save}>
        Save
      </button>
      {saved && <span style={{ marginLeft: "0.6rem", color: "var(--accent-audio)" }}>Saved ✓</span>}
    </div>
  );
}
