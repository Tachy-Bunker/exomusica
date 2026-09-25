import { useEffect, useState } from "react";
import { PlaylistSpaceMapPage } from "./PlaylistSpaceMapPage";
import { PlayerBar } from "../components/PlayerBar";
import { api } from "../lib/api";
import { useCustomFont } from "../lib/useCustomFont";
import { useGlobalPlayerShortcuts } from "../lib/useGlobalPlayerShortcuts";

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

export function EmbedPlaylistPage() {
  const [siteFont, setSiteFont] = useState<{ familyName: string; fileUrl: string; format: string } | null>(null);
  useCustomFont(siteFont); // @font-face injection side effect
  useGlobalPlayerShortcuts(); // play/pause/next/prev/seek/shuffle/loop - only ever wired in Layout.tsx before, which this page bypasses entirely

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
    // See Layout.tsx's identical comment: siteFont.familyName directly,
    // not a value whose own fallback chain ends in var(--font-body).
    if (siteFont) {
      document.documentElement.style.setProperty("--font-body", `"${siteFont.familyName}"`);
      document.documentElement.style.setProperty("--font-display", `"${siteFont.familyName}"`);
    }
  }, [siteFont]);

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", fontFamily: "var(--font-body)", color: "var(--text)" }}>
      <div style={{ flex: 1, padding: "0.4rem" }}>
        <PlaylistSpaceMapPage />
      </div>
      <PlayerBar />
    </div>
  );
}
