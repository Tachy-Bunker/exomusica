import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import { useToastStore } from "../../lib/toastStore";
import { contrastOnDark, isHex, VISOR_DEFAULT, VISOR_MINE_DEFAULT, VISOR_PRESETS } from "../../lib/visorColors";

export function VisorAdminPage() {
  useDocumentTitle("Scan visor colours");
  const [main, setMain] = useState(VISOR_DEFAULT);
  const [mine, setMine] = useState(VISOR_MINE_DEFAULT);
  const [saved, setSaved] = useState({ main: VISOR_DEFAULT, mine: VISOR_MINE_DEFAULT });
  useEffect(() => {
    api<{ visorColor?: string | null; visorMineColor?: string | null }>("/api/site-settings").then((s) => {
      const m = s?.visorColor && isHex(s.visorColor) ? s.visorColor : VISOR_DEFAULT, n = s?.visorMineColor && isHex(s.visorMineColor) ? s.visorMineColor : VISOR_MINE_DEFAULT;
      setMain(m); setMine(n); setSaved({ main: m, mine: n });
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
    </div>
  );
}
