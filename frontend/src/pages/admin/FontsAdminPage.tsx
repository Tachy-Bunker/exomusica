import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { useCustomFont } from "../../lib/useCustomFont";

interface Font {
  id: number;
  name: string;
  familyName: string;
  fileUrl: string;
  format: string;
}

function FontPreviewRow({ font, onDelete }: { font: Font; onDelete: (id: number) => void }) {
  const fontFamily = useCustomFont(font);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0.5rem", borderBottom: "1px solid var(--border)" }}>
      <span style={{ width: 140, fontSize: "0.85rem" }}>{font.name}</span>
      <span style={{ fontFamily, fontSize: "1.1rem", flex: 1 }}>The quick brown fox jumps 0123</span>
      <button className="btn btn-danger" onClick={() => onDelete(font.id)}>
        Delete
      </button>
    </div>
  );
}

export function FontsAdminPage() {
  const [fonts, setFonts] = useState<Font[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [siteDefaultFontId, setSiteDefaultFontId] = useState<number | null>(null);
  const [ambienceUrl, setAmbienceUrl] = useState<string | null>(null);
  const ambienceInputRef = useRef<HTMLInputElement>(null);
  const [scanSfxUrl, setScanSfxUrl] = useState<string | null>(null);
  const scanSfxInputRef = useRef<HTMLInputElement>(null);
  const [textColorPrimary, setTextColorPrimary] = useState("#eef1fb");
  const [textColorSecondary, setTextColorSecondary] = useState("#a89ec2");
  const [chatTitleColor, setChatTitleColor] = useState("#eef1fb");
  const [accentPrimaryColor, setAccentPrimaryColor] = useState("#e2703f");
  const [contentTextScaleDesktop, setContentTextScaleDesktop] = useState(2.0);
  const [contentTextScaleMobile, setContentTextScaleMobile] = useState(1.6);
  const [caInitial, setCaInitial] = useState(0.15);
  const [caBurst, setCaBurst] = useState(0.6);
  const [moireImageUrl, setMoireImageUrl] = useState<string | null>(null);
  const [moireOpacity, setMoireOpacity] = useState(0.15);
  const [moireSize, setMoireSize] = useState(1);
  const [moireOffsetMin, setMoireOffsetMin] = useState(0);
  const [moireOffsetMax, setMoireOffsetMax] = useState(20);
  const [moireOffsetSpeed, setMoireOffsetSpeed] = useState(0.3);
  const [moireWaveform, setMoireWaveform] = useState<"sine" | "triangle">("sine");
  const [moireRotationSpeed, setMoireRotationSpeed] = useState(0.1);
  const moireInputRef = useRef<HTMLInputElement>(null);
  const [effectsSaved, setEffectsSaved] = useState(false);

  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpFrom, setSmtpFrom] = useState("");
  const [smtpPasswordSet, setSmtpPasswordSet] = useState(false);
  const [smtpSaved, setSmtpSaved] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [smtpTesting, setSmtpTesting] = useState(false);

  useEffect(() => {
    api<{
      smtpHost: string | null;
      smtpPort: number | null;
      smtpUser: string | null;
      smtpFrom: string | null;
      smtpPasswordSet: boolean;
    }>("/api/admin/site-settings/smtp").then((s) => {
      setSmtpHost(s.smtpHost ?? "");
      setSmtpPort(s.smtpPort ?? 587);
      setSmtpUser(s.smtpUser ?? "");
      setSmtpFrom(s.smtpFrom ?? "");
      setSmtpPasswordSet(s.smtpPasswordSet);
    });
  }, []);

  async function uploadMoireImage() {
    const file = moireInputRef.current?.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    const result = await api<{ moireImageUrl: string }>("/api/admin/site-settings/moire-image", { method: "POST", body: formData });
    setMoireImageUrl(result.moireImageUrl);
    if (moireInputRef.current) moireInputRef.current.value = "";
  }

  async function removeMoireImage() {
    await api("/api/admin/site-settings/moire-image", { method: "DELETE" });
    setMoireImageUrl(null);
  }

  async function saveEffects() {
    await api("/api/admin/site-settings", {
      method: "PATCH",
      body: JSON.stringify({ caInitial, caBurst, moireOpacity, moireSize, moireOffsetMin, moireOffsetMax, moireOffsetSpeed, moireWaveform, moireRotationSpeed }),
    });
    setEffectsSaved(true);
    setTimeout(() => setEffectsSaved(false), 2000);
  }

  async function saveSmtp() {
    await api("/api/admin/site-settings/smtp", {
      method: "PUT",
      body: JSON.stringify({
        smtpHost: smtpHost || null,
        smtpPort: smtpPort || null,
        smtpUser: smtpUser || null,
        smtpPassword: smtpPassword || undefined,
        smtpFrom: smtpFrom || null,
      }),
    });
    if (smtpPassword) setSmtpPasswordSet(true);
    setSmtpPassword("");
    setSmtpSaved(true);
    setTimeout(() => setSmtpSaved(false), 2000);
  }

  async function testSmtp() {
    setSmtpTesting(true);
    setSmtpTestResult(null);
    try {
      const result = await api<{ ok: boolean; error?: string }>("/api/admin/site-settings/smtp/test", { method: "POST" });
      setSmtpTestResult(result);
    } catch (err) {
      setSmtpTestResult({ ok: false, error: err instanceof ApiError ? err.message : "Test failed" });
    } finally {
      setSmtpTesting(false);
    }
  }

  function load() {
    api<Font[]>("/api/fonts").then(setFonts);
    api<{
      defaultFontId: number | null;
      ambienceUrl: string | null;
      scanSfxUrl: string | null;
      textColorPrimary: string | null;
      textColorSecondary: string | null;
      chatTitleColor: string | null;
      accentPrimaryColor: string | null;
      contentTextScaleDesktop: number;
      contentTextScaleMobile: number;
      caInitial: number;
      caBurst: number;
      moireImageUrl: string | null;
      moireOpacity: number;
      moireSize: number;
      moireOffsetMin: number;
      moireOffsetMax: number;
      moireOffsetSpeed: number;
      moireWaveform: "sine" | "triangle";
      moireRotationSpeed: number;
    }>("/api/site-settings").then((s) => {
      setSiteDefaultFontId(s.defaultFontId);
      setAmbienceUrl(s.ambienceUrl);
      setScanSfxUrl(s.scanSfxUrl);
      if (s.textColorPrimary) setTextColorPrimary(s.textColorPrimary);
      if (s.textColorSecondary) setTextColorSecondary(s.textColorSecondary);
      if (s.chatTitleColor) setChatTitleColor(s.chatTitleColor);
      if (s.accentPrimaryColor) setAccentPrimaryColor(s.accentPrimaryColor);
      setContentTextScaleDesktop(s.contentTextScaleDesktop);
      setContentTextScaleMobile(s.contentTextScaleMobile);
      setCaInitial(s.caInitial);
      setCaBurst(s.caBurst);
      setMoireImageUrl(s.moireImageUrl);
      setMoireOpacity(s.moireOpacity);
      setMoireSize(s.moireSize);
      setMoireOffsetMin(s.moireOffsetMin);
      setMoireOffsetMax(s.moireOffsetMax);
      setMoireOffsetSpeed(s.moireOffsetSpeed);
      setMoireWaveform(s.moireWaveform);
      setMoireRotationSpeed(s.moireRotationSpeed);
    });
  }
  useEffect(load, []);

  async function saveColors() {
    await api("/api/admin/site-settings", {
      method: "PATCH",
      body: JSON.stringify({ textColorPrimary, textColorSecondary, chatTitleColor, accentPrimaryColor }),
    });
  }

  async function saveContentScale() {
    await api("/api/admin/site-settings", {
      method: "PATCH",
      body: JSON.stringify({ contentTextScaleDesktop, contentTextScaleMobile }),
    });
  }

  async function uploadScanSfx() {
    const file = scanSfxInputRef.current?.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    const result = await api<{ scanSfxUrl: string }>("/api/admin/site-settings/scan-sfx", { method: "POST", body: formData });
    setScanSfxUrl(result.scanSfxUrl);
    if (scanSfxInputRef.current) scanSfxInputRef.current.value = "";
  }

  async function removeScanSfx() {
    await api("/api/admin/site-settings/scan-sfx", { method: "DELETE" });
    setScanSfxUrl(null);
  }

  async function uploadAmbience() {
    const file = ambienceInputRef.current?.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    const result = await api<{ ambienceUrl: string }>("/api/admin/site-settings/ambience", { method: "POST", body: formData });
    setAmbienceUrl(result.ambienceUrl);
    if (ambienceInputRef.current) ambienceInputRef.current.value = "";
  }

  async function removeAmbience() {
    await api("/api/admin/site-settings/ambience", { method: "DELETE" });
    setAmbienceUrl(null);
  }

  async function setSiteDefault(idStr: string) {
    const defaultFontId = idStr ? Number(idStr) : null;
    await api("/api/admin/site-settings", { method: "PATCH", body: JSON.stringify({ defaultFontId }) });
    setSiteDefaultFontId(defaultFontId);
  }

  async function handleUpload() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    setError(null);
    const formData = new FormData();
    formData.append("file", file);
    if (name.trim()) formData.append("name", name.trim());
    try {
      await api("/api/admin/fonts", { method: "POST", body: formData });
      setName("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed");
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this font? Anything currently using it falls back to the site default.")) return;
    await api(`/api/admin/fonts/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      <h1>Fonts &amp; Misc</h1>
      <p style={{ color: "var(--text-dim)", fontSize: "0.9rem" }}>
        Upload OTF, TTF, WOFF, or WOFF2 files. Once uploaded, assign one to any branch, discussion topic, wiki page,
        or blog post from that item's edit screen — each picks independently from this library.
      </p>

      <div className="field" style={{ maxWidth: 360 }}>
        <label>Sitewide default font</label>
        <select value={siteDefaultFontId ?? ""} onChange={(e) => setSiteDefault(e.target.value)}>
          <option value="">— built-in default (Space Grotesk) —</option>
          {fonts.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <p style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>
          Applies everywhere nothing more specific overrides it (a branch/topic/wiki/blog font still wins where set).
        </p>
      </div>

      <div className="field" style={{ maxWidth: 420 }}>
        <label>Idle ambience loop</label>
        <p style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: 0 }}>
          Plays on loop whenever nothing else is playing, fading in/out around real tracks. Users can turn it off via
          the "Exo-Ambience" checkbox on the homepage.
        </p>
        {ambienceUrl && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
            <audio src={ambienceUrl} controls style={{ height: 32 }} />
            <button className="btn btn-danger" onClick={removeAmbience}>
              Remove
            </button>
          </div>
        )}
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input ref={ambienceInputRef} type="file" accept="audio/mpeg,audio/wav,audio/ogg" />
          <button className="btn btn-primary" onClick={uploadAmbience}>
            {ambienceUrl ? "Replace" : "Upload"}
          </button>
        </div>
      </div>

      <div className="field" style={{ maxWidth: 420 }}>
        <label>Spacemap scan loop</label>
        <p style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: 0 }}>
          Loops with a smooth fade in/out while text is being revealed in the homepage spacemap — the branch-lock
          name reveal and the F/E/T action hint. Spacemap only, not used anywhere else.
        </p>
        {scanSfxUrl && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
            <audio src={scanSfxUrl} controls style={{ height: 32 }} />
            <button className="btn btn-danger" onClick={removeScanSfx}>
              Remove
            </button>
          </div>
        )}
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input ref={scanSfxInputRef} type="file" accept="audio/mpeg,audio/wav,audio/ogg" />
          <button className="btn btn-primary" onClick={uploadScanSfx}>
            {scanSfxUrl ? "Replace" : "Upload"}
          </button>
        </div>
      </div>

      <div className="field" style={{ maxWidth: 420 }}>
        <label>Text colors</label>
        <p style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: 0 }}>
          Primary and secondary apply site-wide. The third is specific to the chat dock's branch title.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
          <input type="color" value={textColorPrimary} onChange={(e) => setTextColorPrimary(e.target.value)} />
          <span style={{ fontSize: "0.8rem" }}>Primary text</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
          <input type="color" value={textColorSecondary} onChange={(e) => setTextColorSecondary(e.target.value)} />
          <span style={{ fontSize: "0.8rem" }}>Secondary text</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
          <input type="color" value={chatTitleColor} onChange={(e) => setChatTitleColor(e.target.value)} />
          <span style={{ fontSize: "0.8rem" }}>Chat branch title</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
          <input type="color" value={accentPrimaryColor} onChange={(e) => setAccentPrimaryColor(e.target.value)} />
          <span style={{ fontSize: "0.8rem" }}>Primary accent (buttons, links, header, icons)</span>
        </div>
        <button className="btn btn-primary" onClick={saveColors}>
          Save colors
        </button>
      </div>

      <div className="field" style={{ maxWidth: 420 }}>
        <label>Content text size</label>
        <p style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: 0 }}>
          Wiki, News, Forums, and the chat toolbar buttons — multiplier over the base size.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
          <input
            type="range"
            min={1}
            max={3}
            step={0.1}
            value={contentTextScaleDesktop}
            onChange={(e) => setContentTextScaleDesktop(Number(e.target.value))}
          />
          <span style={{ fontSize: "0.8rem" }}>Desktop — {contentTextScaleDesktop.toFixed(1)}x</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
          <input
            type="range"
            min={1}
            max={3}
            step={0.1}
            value={contentTextScaleMobile}
            onChange={(e) => setContentTextScaleMobile(Number(e.target.value))}
          />
          <span style={{ fontSize: "0.8rem" }}>Mobile — {contentTextScaleMobile.toFixed(1)}x</span>
        </div>
        <button className="btn btn-primary" onClick={saveContentScale}>
          Save text size
        </button>
      </div>

      <div className="field" style={{ maxWidth: 420 }}>
        <label>Site-wide effects</label>
        <p style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: 0 }}>
          Chromatic aberration and the moiré generator — both run across the whole site now, not just the spacemap.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem" }}>
          <input type="range" min={0} max={1} step={0.01} value={caInitial} onChange={(e) => setCaInitial(Number(e.target.value))} />
          <span style={{ fontSize: "0.8rem" }}>Aberration initial — {caInitial.toFixed(2)}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.6rem" }}>
          <input type="range" min={0} max={1} step={0.01} value={caBurst} onChange={(e) => setCaBurst(Number(e.target.value))} />
          <span style={{ fontSize: "0.8rem" }}>Aberration burst — {caBurst.toFixed(2)}</span>
        </div>

        <p style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.3rem" }}>Moiré generator</p>
        {moireImageUrl && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
            <img src={moireImageUrl} alt="Moiré pattern" style={{ height: 40, border: "1px solid var(--border)" }} />
            <button className="btn btn-danger" onClick={removeMoireImage}>
              Remove
            </button>
          </div>
        )}
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.4rem" }}>
          <input ref={moireInputRef} type="file" accept="image/png" />
          <button className="btn btn-primary" onClick={uploadMoireImage}>
            {moireImageUrl ? "Replace" : "Upload"}
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem" }}>
          <input type="range" min={0} max={1} step={0.01} value={moireOpacity} onChange={(e) => setMoireOpacity(Number(e.target.value))} />
          <span style={{ fontSize: "0.8rem" }}>Opacity — {moireOpacity.toFixed(2)}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem" }}>
          <input type="range" min={0.2} max={5} step={0.1} value={moireSize} onChange={(e) => setMoireSize(Number(e.target.value))} />
          <span style={{ fontSize: "0.8rem" }}>Size — {moireSize.toFixed(1)}x</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem" }}>
          <input type="range" min={0} max={100} step={1} value={moireOffsetMin} onChange={(e) => setMoireOffsetMin(Number(e.target.value))} />
          <span style={{ fontSize: "0.8rem" }}>Offset min — {moireOffsetMin}px</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem" }}>
          <input type="range" min={0} max={200} step={1} value={moireOffsetMax} onChange={(e) => setMoireOffsetMax(Number(e.target.value))} />
          <span style={{ fontSize: "0.8rem" }}>Offset max — {moireOffsetMax}px</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem" }}>
          <input type="range" min={0} max={2} step={0.01} value={moireOffsetSpeed} onChange={(e) => setMoireOffsetSpeed(Number(e.target.value))} />
          <span style={{ fontSize: "0.8rem" }}>Offset speed — {moireOffsetSpeed.toFixed(2)} Hz</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem" }}>
          <select value={moireWaveform} onChange={(e) => setMoireWaveform(e.target.value as "sine" | "triangle")}>
            <option value="sine">Sine LFO</option>
            <option value="triangle">Triangle LFO</option>
          </select>
          <span style={{ fontSize: "0.8rem" }}>Offset waveform</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
          <input type="range" min={0} max={2} step={0.01} value={moireRotationSpeed} onChange={(e) => setMoireRotationSpeed(Number(e.target.value))} />
          <span style={{ fontSize: "0.8rem" }}>Rotation speed — {moireRotationSpeed.toFixed(2)}/s</span>
        </div>
        <button className="btn btn-primary" onClick={saveEffects}>
          Save effects
        </button>
        {effectsSaved && <span style={{ marginLeft: "0.6rem", fontSize: "0.85rem", color: "var(--accent-audio)" }}>Saved ✓</span>}
      </div>

      <div className="field" style={{ maxWidth: 420 }}>
        <label>SMTP (outgoing email)</label>
        <p style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: 0 }}>
          Overrides the server's environment-variable SMTP config when set. Leave the password blank to keep the
          current one.
        </p>
        <input placeholder="smtp.example.com" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} style={{ marginBottom: "0.3rem" }} />
        <input
          type="number"
          placeholder="Port (587)"
          value={smtpPort}
          onChange={(e) => setSmtpPort(Number(e.target.value))}
          style={{ marginBottom: "0.3rem" }}
        />
        <input placeholder="Username" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} style={{ marginBottom: "0.3rem" }} />
        <input
          type="password"
          placeholder={smtpPasswordSet ? "•••••••• (set — leave blank to keep)" : "Password"}
          value={smtpPassword}
          onChange={(e) => setSmtpPassword(e.target.value)}
          style={{ marginBottom: "0.3rem" }}
        />
        <input placeholder="From address" value={smtpFrom} onChange={(e) => setSmtpFrom(e.target.value)} style={{ marginBottom: "0.5rem" }} />
        <button className="btn btn-primary" onClick={saveSmtp}>
          Save SMTP
        </button>{" "}
        <button className="btn" onClick={testSmtp} disabled={smtpTesting}>
          {smtpTesting ? "Testing…" : "Check connection"}
        </button>
        {smtpSaved && <span style={{ marginLeft: "0.6rem", fontSize: "0.85rem", color: "var(--accent-audio)" }}>Saved ✓</span>}
        {smtpTestResult && (
          <p style={{ fontSize: "0.85rem", color: smtpTestResult.ok ? "var(--accent-audio)" : "var(--accent-danger)", marginTop: "0.4rem" }}>
            {smtpTestResult.ok ? "Connected ✓" : `Failed: ${smtpTestResult.error}`}
          </p>
        )}
      </div>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <input placeholder="Display name (optional — defaults to filename)" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1 }} />
        <input ref={fileInputRef} type="file" accept=".otf,.ttf,.woff,.woff2" />
        <button className="btn btn-primary" onClick={handleUpload}>
          Upload
        </button>
      </div>
      {error && <p style={{ color: "var(--accent-danger)" }}>{error}</p>}

      {fonts.length === 0 && <p style={{ color: "var(--text-dim)" }}>No fonts uploaded yet.</p>}
      {fonts.map((f) => (
        <FontPreviewRow key={f.id} font={f} onDelete={handleDelete} />
      ))}
    </div>
  );
}
