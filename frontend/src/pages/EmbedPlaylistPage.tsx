import { useEffect, useState } from "react";
import { PlaylistSpaceMapPage } from "./PlaylistSpaceMapPage";
import { PlayerBar } from "../components/PlayerBar";
import { api } from "../lib/api";
import { useCustomFont } from "../lib/useCustomFont";

export function EmbedPlaylistPage() {
  const [siteFont, setSiteFont] = useState<{ familyName: string; fileUrl: string; format: string } | null>(null);
  useCustomFont(siteFont); // @font-face injection side effect

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
      if (s.accentPrimaryColor) root.setProperty("--accent-forum", s.accentPrimaryColor);
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
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, padding: "0.4rem" }}>
        <PlaylistSpaceMapPage />
      </div>
      <PlayerBar />
    </div>
  );
}
