import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { JINGLE_EVENTS, JINGLE_LABEL, type JingleEvent } from "../lib/jingleBus";
import { useToastStore } from "../lib/toastStore";

/** Admin: one uploaded recording per moment. Nothing plays for a moment that has no file. */
export function JinglesAdmin() {
  const [urls, setUrls] = useState<Partial<Record<JingleEvent, string>>>({});
  const refs = useRef<Partial<Record<JingleEvent, HTMLInputElement | null>>>({});
  useEffect(() => { api<{ jingleUrls?: Record<string, string> | null }>("/api/site-settings").then((s) => setUrls((s?.jingleUrls ?? {}) as Partial<Record<JingleEvent, string>>)).catch(() => {}); }, []);
  async function upload(e: JingleEvent) {
    const file = refs.current[e]?.files?.[0];
    if (!file) return;
    const fd = new FormData(); fd.append("file", file);
    try {
      const r = await api<{ jingleUrls: Record<string, string> | null }>(`/api/admin/site-settings/jingle/${e}`, { method: "POST", body: fd });
      setUrls((r.jingleUrls ?? {}) as Partial<Record<JingleEvent, string>>);
      if (refs.current[e]) refs.current[e]!.value = "";
      useToastStore.getState().showToast("Pickup sound saved ✓");
    } catch { useToastStore.getState().showToast("Couldn't upload that file"); }
  }
  async function remove(e: JingleEvent) {
    const r = await api<{ jingleUrls: Record<string, string> | null }>(`/api/admin/site-settings/jingle/${e}`, { method: "DELETE" });
    setUrls((r.jingleUrls ?? {}) as Partial<Record<JingleEvent, string>>);
  }
  return (
    <section data-testid="jingles-admin" style={{ marginTop: "1.5rem" }}>
      <h2 style={{ fontSize: "1.1rem" }}>Pickup sounds</h2>
      <p className="home-dim" style={{ fontSize: "0.85rem" }}>Your own recordings, 200–400 ms works best. Each plays once per listener, only if they switched pickup sounds on in their account settings. A moment with no file stays silent.</p>
      {JINGLE_EVENTS.map((e) => (
        <div key={e} data-testid={`jingle-${e}`} style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
          <span style={{ minWidth: 15 + "rem" }}>{JINGLE_LABEL[e]}</span>
          {urls[e] && <audio src={urls[e]} controls preload="none" style={{ height: 30 }} />}
          <input ref={(el) => { refs.current[e] = el; }} type="file" accept="audio/mpeg,audio/wav,audio/ogg" aria-label={`${JINGLE_LABEL[e]} file`} />
          <button type="button" className="btn btn-primary" onClick={() => void upload(e)}>{urls[e] ? "Replace" : "Upload"}</button>
          {urls[e] && <button type="button" className="btn btn-danger" onClick={() => void remove(e)}>Remove</button>}
        </div>
      ))}
    </section>
  );
}
