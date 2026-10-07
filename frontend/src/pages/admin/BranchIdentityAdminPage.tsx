import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { BranchEmblem } from "../../components/BranchEmblem";
import { api, ApiError } from "../../lib/api";
import { GLYPHS, GLYPH_LABEL, PALETTE, derivedColor, identityOf, isHexColor, type Glyph } from "../../lib/branchIdentity";
import type { Branch } from "../../lib/types";

/** Choose how a branch looks around the site: an accent colour and an emblem. Leaving either on "Automatic" keeps a default derived from the name. */
export function BranchIdentityAdminPage() {
  const { id } = useParams<{ id: string }>();
  const [branch, setBranch] = useState<Branch | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const [hexText, setHexText] = useState("");
  const [glyph, setGlyph] = useState<Glyph | null>(null);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    api<Branch[]>("/api/admin/branches").then((all) => {
      const b = all.find((x) => x.id === Number(id)) ?? null;
      setBranch(b);
      const c = isHexColor(b?.identityColor) ? b!.identityColor! : null;
      setColor(c);
      setHexText(c ?? "");
      setGlyph((b?.identityGlyph as Glyph | null) ?? null);
    });
  }, [id]);

  function pickColor(c: string | null) { setColor(c); setHexText(c ?? ""); setStatus(null); }
  function typeHex(v: string) {
    setHexText(v);
    setStatus(null);
    if (isHexColor(v)) setColor(v.toLowerCase());
  }
  async function save() {
    if (!branch) return;
    if (hexText && !isHexColor(hexText)) { setStatus({ kind: "error", text: "A colour looks like #4fa8e0: a # and six letters or digits." }); return; }
    try {
      await api(`/api/admin/branches/${branch.id}`, { method: "PATCH", body: JSON.stringify({ identityColor: color, identityGlyph: glyph }) });
      setStatus({ kind: "ok", text: "Saved. It shows on Soundbay, the homepage map and the branch page." });
    } catch (e) {
      setStatus({ kind: "error", text: e instanceof ApiError ? e.message : "Couldn't save." });
    }
  }

  if (!branch) return <p>Loading…</p>;
  const shown = identityOf({ slug: branch.slug, color, glyph, seed: branch.visibility === "BABY_CRYSTALS" });
  return (
    <div style={{ maxWidth: 720 }} data-testid="identity-page">
      <p><Link to="/admin/branches">← Branches</Link></p>
      <h1>Identity: {branch.name}</h1>
      <p className="home-dim">Pick a colour and an emblem. They appear next to the branch's name on Soundbay, as its dot on the homepage map, and on its own page. The name, description and album count always stay readable.</p>

      <fieldset className="idn-group" data-testid="identity-colors">
        <legend>Colour</legend>
        <div className="idn-swatches" role="radiogroup" aria-label="Colour">
          <button type="button" role="radio" aria-checked={color === null} className={`idn-swatch idn-auto${color === null ? " on" : ""}`} style={{ background: derivedColor(branch.slug) }} onClick={() => pickColor(null)} title="Automatic: derived from the name" data-testid="color-auto">Auto</button>
          {PALETTE.map((p) => (
            <button key={p.hex} type="button" role="radio" aria-checked={color === p.hex} aria-label={p.name} title={p.name} className={`idn-swatch${color === p.hex ? " on" : ""}`} style={{ background: p.hex }} onClick={() => pickColor(p.hex)} data-testid={`color-${p.hex.slice(1)}`} />
          ))}
        </div>
        <label className="idn-hex">Or type a colour <input value={hexText} onChange={(e) => typeHex(e.target.value)} placeholder="#4fa8e0" maxLength={7} aria-label="Colour as #rrggbb" data-testid="color-hex" style={{ width: "7.5rem" }} />
          <input type="color" value={isHexColor(color) ? color! : "#4fa8e0"} onChange={(e) => pickColor(e.target.value)} aria-label="Colour picker" /></label>
      </fieldset>

      <fieldset className="idn-group" data-testid="identity-glyphs">
        <legend>Emblem</legend>
        <div className="idn-glyphs" role="radiogroup" aria-label="Emblem">
          <button type="button" role="radio" aria-checked={glyph === null} className={`idn-glyph${glyph === null ? " on" : ""}`} onClick={() => { setGlyph(null); setStatus(null); }} data-testid="glyph-auto"><span>Auto</span></button>
          {GLYPHS.map((g) => (
            <button key={g} type="button" role="radio" aria-checked={glyph === g} className={`idn-glyph${glyph === g ? " on" : ""}`} onClick={() => { setGlyph(g); setStatus(null); }} data-testid={`glyph-${g}`}>
              <BranchEmblem glyph={g} color={shown.color} size={36} /><span>{GLYPH_LABEL[g]}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <h2 className="home-h2">Preview</h2>
      <div className="idn-preview" data-testid="identity-preview" style={{ ["--emb" as string]: shown.color }}>
        <BranchEmblem glyph={shown.glyph} color={shown.color} size={44} />
        <div><strong>{branch.name}</strong><div className="home-dim" style={{ fontSize: "0.85rem" }}>{branch.description || "The branch description appears here."}</div></div>
        <svg viewBox="0 0 30 30" width="36" height="36" aria-label="Its dot on the map" role="img"><circle cx="15" cy="15" r="7" fill={shown.color} /><circle cx="15" cy="15" r="12" fill="none" stroke={shown.color} strokeOpacity="0.6" /></svg>
      </div>

      <p style={{ marginTop: "1rem" }}><button className="btn btn-primary" onClick={save} data-testid="identity-save">Save</button></p>
      {status && <p role="status" style={{ color: status.kind === "ok" ? "#6fd3a6" : "var(--accent-danger)" }} data-testid="identity-status">{status.text}</p>}
    </div>
  );
}
