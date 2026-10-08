import { DESCRIPTION_GOOD, TITLE_GOOD, imagesIn, lengthVerdict, plainText, suggestSeo, type SeoValue } from "../lib/seoSuggest";

interface SeoFieldsValue {
  ogTitle?: string | null;
  ogDescription?: string | null;
  ogImageUrl?: string | null;
}

/** What the page is, so the tool can show the link preview, count characters and suggest text. All optional: without it the tool is three plain fields. */
export interface SeoPage {
  title: string;
  /** The page's text (markdown): suggestions and the picture choices come from it. */
  body?: string;
  /** Pictures the page already has (a cover, a background), offered first. */
  images?: string[];
  /** The address the link points to, shown in the preview. */
  path?: string;
}

const Count = ({ text, good }: { text: string; good: number }) => {
  const v = lengthVerdict(text, good);
  return <span className={`seo-count seo-${v}`} aria-label={`${text.trim().length} characters, ${v === "long" ? "too long" : "fine"}`}>{text.trim().length}/{good}</span>;
};

/** Embed / SEO: what a link to the page shows on Discord, search results and social sites. Blank = the site default. */
export function SeoFieldsEditor({
  value,
  onChange,
  defaultNote,
  page,
}: {
  value: SeoFieldsValue;
  onChange: (patch: Partial<SeoFieldsValue>) => void;
  defaultNote?: string;
  page?: SeoPage;
}) {
  const title = value.ogTitle ?? "";
  const description = value.ogDescription ?? "";
  const image = value.ogImageUrl ?? "";
  const shownTitle = title.trim() || page?.title || "(the site default)";
  const shownDescription = description.trim() || (page?.body ? plainText(page.body, DESCRIPTION_GOOD) : "") || "(the site default)";
  const shownImage = image.trim() || page?.images?.[0] || (page?.body ? imagesIn(page.body, 1)[0] : "") || "";
  const choices = page ? [...new Set([...(page.images ?? []), ...(page.body ? imagesIn(page.body) : [])])].slice(0, 12) : [];
  const fill = () => {
    if (!page) return;
    const s: SeoValue = suggestSeo({ title: page.title, body: page.body ?? "" }, value);
    onChange({ ogTitle: s.ogTitle ?? null, ogDescription: s.ogDescription ?? null, ogImageUrl: s.ogImageUrl ?? null });
  };
  return (
    <div className="seo-tool" data-testid="seo-tool" style={{ border: "1px dashed var(--border)", borderRadius: "var(--radius)", padding: "0.6rem", marginTop: "0.6rem" }}>
      <div className="seo-head">
        <h4 style={{ fontSize: "0.85rem", margin: 0 }}>Embed / SEO</h4>
        {page && <button type="button" className="btn" style={{ fontSize: "0.75rem" }} onClick={fill} data-testid="seo-fill">Fill the blanks from the text</button>}
      </div>
      <p style={{ fontSize: "0.75rem", color: "var(--text-dim)", margin: "0.3rem 0 0.4rem" }}>
        {defaultNote ?? "Leave any field blank to fall back to the site-wide default for this page type."}
      </p>
      <div className="field">
        <label>Title <Count text={title} good={TITLE_GOOD} /></label>
        <input value={title} onChange={(e) => onChange({ ogTitle: e.target.value || null })} placeholder={page ? page.title : "(use default)"} />
      </div>
      <div className="field">
        <label>Description <Count text={description} good={DESCRIPTION_GOOD} /></label>
        <textarea rows={2} value={description} onChange={(e) => onChange({ ogDescription: e.target.value || null })} placeholder="(use default)" />
      </div>
      <div className="field">
        <label>Image</label>
        <input value={image} onChange={(e) => onChange({ ogImageUrl: e.target.value || null })} placeholder="(use default) - a link, or pick one below" />
        {choices.length > 0 && (
          <div className="seo-pics" role="group" aria-label="Pictures from the page">
            {choices.map((u) => <button key={u} type="button" className={u === image ? "on" : ""} onClick={() => onChange({ ogImageUrl: u === image ? null : u })} aria-pressed={u === image} title={u}><img src={u} alt="" loading="lazy" decoding="async" /></button>)}
          </div>
        )}
      </div>
      {page && (
        <div className="seo-preview" aria-label="How a link will look" data-testid="seo-preview">
          {shownImage ? <img src={shownImage} alt="" loading="lazy" decoding="async" /> : <div className="seo-noimg">no picture</div>}
          <div className="seo-pv-text">
            <small>exomusica.com{page.path ?? ""}</small>
            <b>{shownTitle}</b>
            <span>{shownDescription}</span>
          </div>
        </div>
      )}
    </div>
  );
}
