import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import { JinglesAdmin } from "../../components/JinglesAdmin";
import { useToastStore } from "../../lib/toastStore";
import { bracketStyle, DEFAULT_COLORS, type ProbeColors } from "../../lib/probeCore";
import { contrastOnDark, isHex, VISOR_DEFAULT, VISOR_MINE_DEFAULT, VISOR_PRESETS } from "../../lib/visorColors";

export function VisorAdminPage() {
  useDocumentTitle("Scan visor colours");
  const [main, setMain] = useState(VISOR_DEFAULT);
  const [mine, setMine] = useState(VISOR_MINE_DEFAULT);
  const [saved, setSaved] = useState({ main: VISOR_DEFAULT, mine: VISOR_MINE_DEFAULT });
  const [probe, setProbe] = useState<ProbeColors>(DEFAULT_COLORS);
  const [probeSaved, setProbeSaved] = useState<ProbeColors>(DEFAULT_COLORS);
  useEffect(() => {
    api<{ visorColor?: string | null; visorMineColor?: string | null; probeColors?: Partial<ProbeColors> | null }>("/api/site-settings").then((s) => {
      const m = s?.visorColor && isHex(s.visorColor) ? s.visorColor : VISOR_DEFAULT, n = s?.visorMineColor && isHex(s.visorMineColor) ? s.visorMineColor : VISOR_MINE_DEFAULT;
      setMain(m); setMine(n); setSaved({ main: m, mine: n });
      const pc = { ...DEFAULT_COLORS, ...(s?.probeColors ?? {}) }; setProbe(pc); setProbeSaved(pc);
    }).catch(() => {});
  }, []);

  async function save() {
    await api("/api/admin/site-settings", { method: "PATCH", body: JSON.stringify({ visorColor: main === VISOR_DEFAULT ? null : main, visorMineColor: mine === VISOR_MINE_DEFAULT ? null : mine }) });
    // The visor wears the new colours straight away, without a reload.
    const root = document.documentElement.style;
    if (main === VISOR_DEFAULT) root.removeProperty("--visor"); else root.setProperty("--visor", main);
    if (mine === VISOR_MINE_DEFAULT) root.removeProperty("--visor-mine"); else root.setProperty("--visor-mine", mine);
    setSaved({ main, mine });
    useToastStore.getState().showToast("Visor colours saved ✓");
  }
  const probeDirty = (Object.keys(probe) as (keyof ProbeColors)[]).some((k) => probe[k] !== probeSaved[k]);
  const probeWeak = (Object.values(probe) as string[]).some((c) => contrastOnDark(c) < 4.5);
  async function saveProbe() {
    const isDefault = (Object.keys(probe) as (keyof ProbeColors)[]).every((k) => probe[k].toLowerCase() === DEFAULT_COLORS[k]);
    await api("/api/admin/site-settings", { method: "PATCH", body: JSON.stringify({ probeColors: isDefault ? null : probe }) });
    setProbeSaved(probe);
    useToastStore.getState().showToast("Probe colours saved ✓ (members see them on their next page load)");
  }
  const dirty = main !== saved.main || mine !== saved.mine;
  const weak = [main, mine].some((c) => contrastOnDark(c) < 4.5);

  return (
    <div data-testid="visor-admin">
      <h1>Scan visor colours</h1>
      <p className="home-dim" style={{ fontSize: "0.85rem" }}>The colour of the visor grid, its panel and other travellers' notes, and the colour of your own notes. The preview below is the real thing, not a picture of it.</p>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.8rem" }} data-testid="visor-presets">
        {VISOR_PRESETS.map((p) => (
          <button key={p.name} type="button" className="btn" onClick={() => { setMain(p.main); setMine(p.mine); }}>
            <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: p.main, marginRight: 6 }} />{p.name}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: "1.2rem", flexWrap: "wrap", alignItems: "center", marginBottom: "0.8rem" }}>
        <label>Visor <input type="color" value={main} onChange={(e) => setMain(e.target.value)} aria-label="Visor colour" data-testid="visor-main" /> <span className="mono">{main}</span></label>
        <label>Your notes <input type="color" value={mine} onChange={(e) => setMine(e.target.value)} aria-label="Your notes colour" data-testid="visor-mine" /> <span className="mono">{mine}</span></label>
      </div>
      {weak && <p role="status" data-testid="visor-weak" style={{ fontSize: "0.85rem", color: "var(--accent-danger)" }}>One of these is dark against the page; small visor text will be hard to read. Pick something brighter.</p>}

      <div className="visor-preview" style={{ ["--visor" as string]: main, ["--visor-mine" as string]: mine }} data-testid="visor-preview">
        <div className="visor-grid" aria-hidden="true"><i /><i /><i /><i /></div>
        <div className="visor-hud">
          <p className="visor-bar">SCAN VISOR <span>on</span></p>
          <p className="visor-sector">Sector <b>142.3 MHz</b></p>
          <div className="visor-tools"><button type="button" className="visor-btn go">Write on the page</button><button type="button" className="visor-btn">Off</button></div>
        </div>
        <div className="visor-beacon"><span className="visor-dot" /><span className="visor-label">a note left by a traveller</span></div>
        <div className="visor-beacon mine"><span className="visor-dot" /><span className="visor-label">your own note</span></div>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.8rem" }}>
        <button className="btn btn-primary" disabled={!dirty} onClick={save} data-testid="visor-save">Save</button>
        <button className="btn" onClick={() => { setMain(VISOR_DEFAULT); setMine(VISOR_MINE_DEFAULT); }}>Reset to default</button>
      </div>

      <h2 style={{ fontSize: "1rem", marginTop: "2rem" }}>Probe mode brackets</h2>
      <p className="home-dim" style={{ fontSize: "0.85rem" }}>What the brackets look like when a member turns Probe mode on (key I). Each kind of thing has its own colour. "Flag" is only drawn for admins.</p>
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "0.8rem" }} data-testid="probe-colors">
        {(Object.keys(probe) as (keyof ProbeColors)[]).map((k) => (
          <label key={k} style={{ textTransform: "capitalize" }}>{k === "mod" ? "Flag" : k} <input type="color" value={probe[k]} onChange={(e) => setProbe({ ...probe, [k]: e.target.value })} aria-label={`${k} colour`} data-testid={`probe-${k}`} /></label>
        ))}
      </div>
      {probeWeak && <p role="status" data-testid="probe-weak" style={{ fontSize: "0.85rem", color: "var(--accent-danger)" }}>A dark colour will barely show against the page. Pick something brighter.</p>}
      <div className="probe-preview" data-testid="probe-preview">
        <span style={bracketStyle(probe.lore)} data-testid="pp-lore">A wiki page or study</span>
        <span style={bracketStyle(probe.track)} data-testid="pp-track">An album or track</span>
        <span style={bracketStyle(probe.person)} data-testid="pp-person">@a member</span>
        <span style={bracketStyle(probe.mod)} data-testid="pp-mod">Awaiting review</span>
      </div>
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.8rem" }}>
        <button className="btn btn-primary" disabled={!probeDirty} onClick={saveProbe} data-testid="probe-save">Save bracket colours</button>
        <button className="btn" onClick={() => setProbe(DEFAULT_COLORS)}>Reset to default</button>
      </div>
      <JinglesAdmin />
    </div>
  );
}
