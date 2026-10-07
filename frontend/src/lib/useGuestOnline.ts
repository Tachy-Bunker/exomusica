import { useEffect } from "react";
import { api } from "./api";
import { usePresenceStore } from "./presenceStore";

/** Visitors who are not logged in can't open the presence socket, so they get the number of people online from a public address instead, a few times a minute while the tab is visible. */
export function useGuestOnline(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = () => {
      if (document.hidden) return;
      api<{ online: number }>("/api/online").then((d) => { if (alive) usePresenceStore.setState({ onlineCount: d.online }); }).catch(() => {});
    };
    load();
    const id = window.setInterval(load, 30_000);
    return () => { alive = false; window.clearInterval(id); };
  }, [enabled]);
}
