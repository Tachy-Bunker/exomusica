import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { drawQr, qrToSvg, QR_DEFAULTS } from "../lib/qrStyle";
import { useToastStore } from "../lib/toastStore";

interface Props {
  /** What the code opens. */
  url: string;
  title: string;
  /** Images on the site that can be offered as backgrounds (e.g. the ones a study already uses). */
  candidateImages?: string[];
  onClose: () => void;
}

type LogoChoice = "default" | "none" | "custom";

const STORE_KEY = "exomusica_qr_style";
const PREVIEW = 320;
const EXPORT = 1024;

/** Same-origin images only for export: a picture from a host without CORS would taint the canvas and block saving. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("couldn't load that image"));
    img.src = src;
  });
}

function toDataUrl(img: HTMLImageElement, max = 1024): string {
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * k);
  c.height = Math.round(img.naturalHeight * k);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.85);
}

function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function QrModal({ url, title, candidateImages = [], onClose }: Props) {
  const saved = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}") as { logo?: LogoChoice; dim?: number; rounded?: boolean };
    } catch {
      return {};
    }
  }, []);
  const [logo, setLogo] = useState<LogoChoice>(saved.logo ?? "default");
  const [customLogoUrl, setCustomLogoUrl] = useState("");
  const [bgChoice, setBgChoice] = useState(""); // "" = none, an image address from this page, or "__custom"
  const [customBg, setCustomBg] = useState("");
  const bg = bgChoice === "__custom" ? customBg.trim() : bgChoice;
  const [dim, setDim] = useState(saved.dim ?? QR_DEFAULTS.backgroundDim);
  const [rounded, setRounded] = useState(saved.rounded ?? true);
  const [problem, setProblem] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ logo, dim, rounded }));
    } catch {
      // not worth failing over
    }
  }, [logo, dim, rounded]);

  /** Loads whichever images are chosen. A picture that can't load is dropped with a note rather than breaking the code. */
  async function resolveImages(): Promise<{ background: HTMLImageElement | null; logoImg: HTMLImageElement | null; note: string | null }> {
    let note: string | null = null;
    let background: HTMLImageElement | null = null;
    let logoImg: HTMLImageElement | null = null;
    if (bg) {
      try {
        background = await loadImage(bg);
      } catch {
        note = "That background couldn't be loaded (images from other websites often can't be used - upload it to the site first). Showing the code without it.";
      }
    }
    if (logo === "custom" && customLogoUrl) {
      try {
        logoImg = await loadImage(customLogoUrl);
      } catch {
        note = (note ? note + " " : "") + "That logo couldn't be loaded. Showing the Exomusica mark instead.";
      }
    }
    return { background, logoImg, note };
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { background, logoImg, note } = await resolveImages();
      if (cancelled || !canvasRef.current) return;
      setProblem(note);
      const logoStyle = logo === "none" ? null : logo === "custom" && logoImg ? logoImg : "default";
      drawQr(canvasRef.current, url, { size: PREVIEW, background, backgroundDim: dim, logo: logoStyle, rounded });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, logo, customLogoUrl, bg, dim, rounded]);

  async function savePng() {
    const { background, logoImg } = await resolveImages();
    const c = document.createElement("canvas");
    drawQr(c, url, { size: EXPORT, background, backgroundDim: dim, logo: logo === "none" ? null : logo === "custom" && logoImg ? logoImg : "default", rounded });
    c.toBlob((b) => b && download(b, "exomusica-qr.png"), "image/png");
  }

  async function saveSvg() {
    const { background, logoImg } = await resolveImages();
    const svg = qrToSvg(url, {
      size: EXPORT,
      backgroundDim: dim,
      backgroundDataUrl: background ? toDataUrl(background) : null,
      logoDataUrl: logo === "custom" && logoImg ? toDataUrl(logoImg, 256) : null,
      useDefaultLogo: logo === "default" || (logo === "custom" && !logoImg),
    });
    download(new Blob([svg], { type: "image/svg+xml" }), "exomusica-qr.svg");
  }

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="QR code" data-testid="qr-modal" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", overflowY: "auto" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "1rem", maxWidth: 560, width: "92%", margin: "1rem" }}>
        <h3 style={{ marginTop: 0 }}>QR code · {title}</h3>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <canvas ref={canvasRef} data-testid="qr-canvas" style={{ width: PREVIEW, height: PREVIEW, maxWidth: "100%", borderRadius: "var(--radius)" }} />
          <div style={{ flex: "1 1 200px", display: "flex", flexDirection: "column", gap: "0.6rem", fontSize: "0.85rem" }}>
            <label>
              Logo{" "}
              <select value={logo} onChange={(e) => setLogo(e.target.value as LogoChoice)}>
                <option value="default">Exomusica mark</option>
                <option value="none">None</option>
                <option value="custom">An image from the site…</option>
              </select>
            </label>
            {logo === "custom" && <input value={customLogoUrl} onChange={(e) => setCustomLogoUrl(e.target.value)} placeholder="/uploads/messages/…" />}
            <label>
              Background{" "}
              <select value={bgChoice} onChange={(e) => setBgChoice(e.target.value)}>
                <option value="">None</option>
                {candidateImages.map((u, i) => (
                  <option key={u} value={u}>
                    Image {i + 1} from this page
                  </option>
                ))}
                <option value="__custom">Another image on the site…</option>
              </select>
            </label>
            {bgChoice === "__custom" && <input value={customBg} onChange={(e) => setCustomBg(e.target.value)} placeholder="/uploads/messages/…" />}
            {bg && (
              <label>
                Darken background{" "}
                <input type="range" min={0} max={0.8} step={0.05} value={dim} onChange={(e) => setDim(Number(e.target.value))} />
              </label>
            )}
            <label>
              <input type="checkbox" checked={rounded} onChange={(e) => setRounded(e.target.checked)} /> Rounded dots
            </label>
            {problem && <p style={{ color: "var(--accent-forum)", margin: 0 }}>{problem}</p>}
            <p style={{ color: "var(--text-dim)", margin: 0 }}>The code keeps maximum error correction and the logo is kept small, so it still scans. Always test it with your phone before printing.</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.8rem", justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button className="btn" onClick={() => void saveSvg()}>
            Download SVG (for print)
          </button>
          <button className="btn btn-primary" onClick={() => void savePng()}>
            Download PNG
          </button>
          <button
            className="btn"
            onClick={() => {
              void navigator.clipboard.writeText(url);
              useToastStore.getState().showToast("Link copied ✓");
            }}
          >
            Copy link
          </button>
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
