import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { BranchEmblem } from "../../components/BranchEmblem";
import { api, ApiError, getToken } from "../../lib/api";
import { GLYPHS, GLYPH_LABEL, PALETTE, derivedColor, identityOf, isHexColor, type Glyph } from "../../lib/branchIdentity";
import type { BranchPicture } from "../../lib/home";
import { colorFromImageUrl } from "../../lib/imageColor";
import type { Branch } from "../../lib/types";

/** Choose how a branch looks around the site: an accent colour, an emblem or a main image (its colour then follows the image), and a secondary image for backgrounds. */
export function BranchIdentityAdminPage() {
  const { id } = useParams<{ id: string }>();
  const [branch, setBranch] = useState<Branch | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const [hexText, setHexText] = useState("");
  const [glyph, setGlyph] = useState<Glyph | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [secondaryUrl, setSecondaryUrl] = useState<string | null>(null);
  const [pictures, setPictures] = useState<BranchPicture[]>([]);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    api<Branch[]>("/api/admin/branches").then((all) => {
      const b = all.find((x) => x.id === Number(id)) ?? null;
      setBranch(b);
      const c = isHexColor(b?.identityColor) ? b!.identityColor! : null;
      setColor(c);
      setHexText(c ?? "");
      setGlyph((b?.identityGlyph as Glyph | null) ?? null);
      setImageUrl(b?.identityImageUrl ?? null);
      setSecondaryUrl(b?.identitySecondaryImageUrl ?? null);
      // every picture this branch has: its cover, its albums' covers and their gallery images
      if (b) api<BranchPicture[]>(`/api/branches/${b.slug}/images`).then((p) => setPictures(p.slice(0, 40))).catch(() => {});
    });
  }, [id]);

  function pickColor(c: string | null) { setColor(c); setHexText(c ?? ""); setStatus(null); }
  function typeHex(v: string) {
    setHexText(v);
    setStatus(null);
    if (isHexColor(v)) setColor(v.toLowerCase());
  }
  /** The main image decides the branch's colour: the average of the picture (it can still be changed by hand afterwards). */
  async function chooseMain(url: string | null) {
    setImageUrl(url);
    setStatus(null);
    if (!url) return;
    const avg = await colorFromImageUrl(url);
    if (avg) { pickColor(avg); setStatus({ kind: "ok", text: `The branch's colour is now ${avg}, the average of this picture. You can still change it above.` }); }
    else setStatus({ kind: "error", text: "Couldn't read this picture's colours, so the colour is unchanged. Choose one above if you like." });
  }
  async function uploadImage(file: File) {
    if (!branch) return;
    setUploading(true);
    setStatus(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/admin/branches/${branch.id}/identity-image`, { method: "POST", body: form, headers: getToken() ? { authorization: `Bearer ${getToken()}` } : {} });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Couldn't upload that picture.");
      await chooseMain(body.identityImageUrl);
      setStatus((cur) => ({ kind: "ok", text: `Uploaded. ${cur?.kind === "ok" ? cur.text + " " : ""}Press Save to keep your choices.` }));
    } catch (e) {
      setStatus({ kind: "error", text: e instanceof Error ? e.message : "Couldn't upload that picture." });
    } finally {
      setUploading(false);
    }
  }
  async function save() {
    if (!branch) return;
    if (hexText && !isHexColor(hexText)) { setStatus({ kind: "error", text: "A colour looks like #4fa8e0: a # and six letters or digits." }); return; }
    try {
      await api(`/api/admin/branches/${branch.id}`, { method: "PATCH", body: JSON.stringify({ identityColor: color, identityGlyph: glyph, identityImageUrl: imageUrl, identitySecondaryImageUrl: secondaryUrl }) });
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

      <fieldset className="idn-group" data-testid="identity-image">
        <legend>Main image <span className="home-dim">(optional: shown instead of the emblem, and the branch's colour becomes its average)</span></legend>
        <div className="idn-glyphs" role="radiogroup" aria-label="Main image">
          <button type="button" role="radio" aria-checked={imageUrl === null} className={`idn-glyph${imageUrl === null ? " on" : ""}`} onClick={() => chooseMain(null)} data-testid="image-none"><span>Use the emblem</span></button>
          {pictures.map((c, i) => (
            <button key={c.url} type="button" role="radio" aria-checked={imageUrl === c.url} className={`idn-glyph${imageUrl === c.url ? " on" : ""}`} onClick={() => chooseMain(c.url)} data-testid={`image-existing-${i}`} title={c.label}>
              <img src={c.url} alt="" width={44} height={44} style={{ objectFit: "cover", borderRadius: 8 }} /><span>{c.label}</span>
            </button>
          ))}
          {imageUrl && !pictures.some((c) => c.url === imageUrl) && (
            <button type="button" role="radio" aria-checked className="idn-glyph on" data-testid="image-uploaded"><img src={imageUrl} alt="" width={44} height={44} style={{ objectFit: "cover", borderRadius: 8 }} /><span>Uploaded</span></button>
          )}
        </div>
        <label className="idn-hex">Or upload a picture <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f); e.target.value = ""; }} data-testid="image-upload" /></label>
        {uploading && <span className="home-dim" role="status"> Uploading…</span>}
      </fieldset>

      <fieldset className="idn-group" data-testid="identity-secondary">
        <legend>Secondary image <span className="home-dim">(optional: the soft background of its tile on the homepage grid, and of the whole module while it is chosen)</span></legend>
        <div className="idn-glyphs" role="radiogroup" aria-label="Secondary image">
          <button type="button" role="radio" aria-checked={secondaryUrl === null} className={`idn-glyph${secondaryUrl === null ? " on" : ""}`} onClick={() => { setSecondaryUrl(null); setStatus(null); }} data-testid="secondary-none"><span>None</span></button>
          {pictures.map((c, i) => (
            <button key={c.url} type="button" role="radio" aria-checked={secondaryUrl === c.url} className={`idn-glyph${secondaryUrl === c.url ? " on" : ""}`} onClick={() => { setSecondaryUrl(c.url); setStatus(null); }} data-testid={`secondary-existing-${i}`} title={c.label}>
              <img src={c.url} alt="" width={44} height={44} style={{ objectFit: "cover", borderRadius: 8 }} /><span>{c.label}</span>
            </button>
          ))}
        </div>
        {pictures.length === 0 && <p className="home-dim">This branch has no pictures yet: add album covers or gallery images to its albums and they appear here.</p>}
      </fieldset>

      <h2 className="home-h2">Preview</h2>
      <div className="idn-preview" data-testid="identity-preview" style={{ ["--emb" as string]: shown.color, position: "relative", isolation: "isolate" }}>
        {secondaryUrl && <div aria-hidden="true" data-testid="identity-preview-bg" style={{ position: "absolute", inset: 0, zIndex: -1, borderRadius: "inherit", backgroundImage: `url("${secondaryUrl}")`, backgroundSize: "cover", backgroundPosition: "center", opacity: 0.17 }} />}
        <BranchEmblem glyph={shown.glyph} color={shown.color} size={44} imageUrl={imageUrl} />
        <div><strong>{branch.name}</strong><div className="home-dim" style={{ fontSize: "0.85rem" }}>{branch.description || "The branch description appears here."}</div></div>
        <svg viewBox="0 0 30 30" width="36" height="36" aria-label="Its dot on the map" role="img"><circle cx="15" cy="15" r="7" fill={shown.color} /><circle cx="15" cy="15" r="12" fill="none" stroke={shown.color} strokeOpacity="0.6" /></svg>
      </div>

      <p style={{ marginTop: "1rem" }}><button className="btn btn-primary" onClick={save} data-testid="identity-save">Save</button></p>
      {status && <p role="status" style={{ color: status.kind === "ok" ? "#6fd3a6" : "var(--accent-danger)" }} data-testid="identity-status">{status.text}</p>}
    </div>
  );
}
