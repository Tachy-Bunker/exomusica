interface SeoFieldsValue {
  ogTitle?: string | null;
  ogDescription?: string | null;
  ogImageUrl?: string | null;
}

export function SeoFieldsEditor({
  value,
  onChange,
  defaultNote,
}: {
  value: SeoFieldsValue;
  onChange: (patch: Partial<SeoFieldsValue>) => void;
  defaultNote?: string;
}) {
  return (
    <div style={{ border: "1px dashed var(--border)", borderRadius: "var(--radius)", padding: "0.6rem", marginTop: "0.6rem" }}>
      <h4 style={{ fontSize: "0.85rem", margin: "0 0 0.3rem" }}>Embed / SEO override</h4>
      <p style={{ fontSize: "0.75rem", color: "var(--text-dim)", margin: "0 0 0.4rem" }}>
        {defaultNote ?? "Leave any field blank to fall back to the site-wide default for this page type."}
      </p>
      <div className="field">
        <label>Title override</label>
        <input value={value.ogTitle ?? ""} onChange={(e) => onChange({ ogTitle: e.target.value || null })} placeholder="(use default)" />
      </div>
      <div className="field">
        <label>Description override</label>
        <input value={value.ogDescription ?? ""} onChange={(e) => onChange({ ogDescription: e.target.value || null })} placeholder="(use default)" />
      </div>
      <div className="field">
        <label>Image URL override</label>
        <input value={value.ogImageUrl ?? ""} onChange={(e) => onChange({ ogImageUrl: e.target.value || null })} placeholder="(use default)" />
      </div>
    </div>
  );
}
