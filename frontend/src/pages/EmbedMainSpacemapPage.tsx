import { useEffect, useState } from "react";
import { HomePage } from "./HomePage";
import { api } from "../lib/api";
import { useCustomFont } from "../lib/useCustomFont";

function darkenHex(hex: string, amount: number): string {
  const m = hex.replace("#", "");
  if (m.length !== 6) return hex;
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  const mix = (c: number) => Math.round(c * (1 - amount));
  const toHex = (c: number) => c.toString(16).padStart(2, "0");
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}

// Chrome-less embed of the main branch spacemap, same pattern as
// EmbedPlaylistPage - no Layout, so theme setup has to happen here too.
export function EmbedMainSpacemapPage() {
  const [siteFont, setSiteFont] = useState<{ familyName: string; fileUrl: string; format: string } | null>(null);
  useCustomFont(siteFont);

  useEffect(() => {
    document.documentElement.style.setProperty("--nav-height", "0px");
    api<{
      defaultFont: typeof siteFont;
      textColorPrimary: string | null;
      textColorSecondary: string | null;
      accentPrimaryColor: string | null;
    }>("/api/site-settings").then((s) => {
      setSiteFont(s.defaultFont);
      const root = document.documentElement.style;
      if (s.textColorPrimary) root.setProperty("--text", s.textColorPrimary);
      if (s.textColorSecondary) root.setProperty("--text-dim", s.textColorSecondary);
      if (s.accentPrimaryColor) {
        root.setProperty("--accent-forum", s.accentPrimaryColor);
        root.setProperty("--accent-forum-dim", darkenHex(s.accentPrimaryColor, 0.45));
      }
    });
  }, []);

  useEffect(() => {
    if (siteFont) {
      document.documentElement.style.setProperty("--font-body", `"${siteFont.familyName}"`);
      document.documentElement.style.setProperty("--font-display", `"${siteFont.familyName}"`);
    }
  }, [siteFont]);

  return (
    <div style={{ minHeight: "100dvh", fontFamily: "var(--font-body)", color: "var(--text)" }}>
      <HomePage />
    </div>
  );
}
