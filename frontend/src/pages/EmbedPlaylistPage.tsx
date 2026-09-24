import { useEffect } from "react";
import { PlaylistSpaceMapPage } from "./PlaylistSpaceMapPage";
import { PlayerBar } from "../components/PlayerBar";

export function EmbedPlaylistPage() {
  useEffect(() => {
    document.documentElement.style.setProperty("--nav-height", "0px");
  }, []);

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, padding: "0.4rem" }}>
        <PlaylistSpaceMapPage />
      </div>
      <PlayerBar />
    </div>
  );
}
