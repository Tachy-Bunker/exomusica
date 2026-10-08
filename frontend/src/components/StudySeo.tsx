import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { SeoFieldsEditor } from "./SeoFieldsEditor";

/** The study's embed / SEO: what a link to it says on Discord and in search. Folded away until wanted. */
export function StudySeo({ study, onSaved }: { study: { slug: string; title: string; body: string; backgroundUrl?: string | null; ogTitle?: string | null; ogDescription?: string | null; ogImageUrl?: string | null }; onSaved: () => void }) {
  const [v, setV] = useState({ ogTitle: study.ogTitle ?? "", ogDescription: study.ogDescription ?? "", ogImageUrl: study.ogImageUrl ?? "" });
  const [state, setState] = useState<"idle" | "saving" | "saved" | string>("idle");
  useEffect(() => setV({ ogTitle: study.ogTitle ?? "", ogDescription: study.ogDescription ?? "", ogImageUrl: study.ogImageUrl ?? "" }), [study.ogTitle, study.ogDescription, study.ogImageUrl]);
  async function save() {
    setState("saving");
    try {
      await api(`/api/studies/${study.slug}`, { method: "PATCH", body: JSON.stringify({ ogTitle: v.ogTitle || null, ogDescription: v.ogDescription || null, ogImageUrl: v.ogImageUrl || null }) });
      setState("saved");
      onSaved();
    } catch (e) { setState(e instanceof ApiError ? e.message : "Couldn't save"); }
  }
  return (
    <details className="study-seo" data-testid="study-seo">
      <summary>Embed / SEO <span className="home-dim">how a link to this study looks</span></summary>
      <SeoFieldsEditor
        value={v}
        onChange={(patch) => { setState("idle"); setV((cur) => ({ ...cur, ...Object.fromEntries(Object.entries(patch).map(([k, val]) => [k, val ?? ""])) })); }}
        page={{ title: study.title, body: study.body, images: study.backgroundUrl ? [study.backgroundUrl] : [], path: `/study/${study.slug}` }}
        defaultNote="Blank = the study's title, its first words and its background (or first picture)."
      />
      <p><button type="button" className="btn btn-primary" onClick={save} disabled={state === "saving"}>Save</button>{" "}
        {state === "saved" && <span role="status" className="home-dim">Saved.</span>}
        {state !== "idle" && state !== "saved" && state !== "saving" && <span role="alert" className="an-err">{state}</span>}</p>
    </details>
  );
}
