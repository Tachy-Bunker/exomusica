import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { Loading } from "../components/Loading";

interface Block {
  year: number; yearsAgo: number;
  albums: { slug: string; title: string; composer: string }[];
  studies: { slug: string; title: string; owner: string }[];
  chat: { count: number; channels: { slug: string; name: string; count: number }[]; highlights: { id: number; author: string; text: string; channelSlug: string; day: string }[] } | null;
}
interface Capsule { day: string; years: Block[] }

export function CapsulePage() {
  useDocumentTitle("This day in past years");
  const [params, setParams] = useSearchParams();
  const md = params.get("md") ?? "";
  const [data, setData] = useState<Capsule | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setData(null); setFailed(false);
    api<Capsule>(`/api/capsule${md ? `?md=${encodeURIComponent(md)}` : ""}`).then((d) => (d && Array.isArray(d.years) ? setData(d) : setFailed(true))).catch(() => setFailed(true));
  }, [md]);
  const label = data ? new Date(data.day + "T00:00:00Z").toLocaleDateString(undefined, { month: "long", day: "numeric", timeZone: "UTC" }) : "";

  return (
    <div className="page-column" style={{ maxWidth: 760 }} data-testid="capsule-page">
      <h1>{label ? `${label}, in past years` : "This day in past years"}</h1>
      <label className="home-dim" style={{ fontSize: "0.85rem" }}>
        Another day:{" "}
        <input type="date" aria-label="Pick a day" value={data?.day ?? ""} onChange={(e) => e.target.value && setParams({ md: e.target.value.slice(5) })} />
      </label>
      {failed ? <p role="alert">Couldn't load it. Try again in a moment.</p> : !data ? <Loading /> : data.years.length === 0 ? (
        <p className="home-dim" data-testid="capsule-empty" style={{ marginTop: "1rem" }}>Nothing happened on this day in earlier years yet.</p>
      ) : data.years.map((y) => (
        <section key={y.year} className="capsule-year" data-testid="capsule-year">
          <h2>{y.year} <span className="home-dim" style={{ fontWeight: 400, fontSize: "0.8rem" }}>· {y.yearsAgo} year{y.yearsAgo > 1 ? "s" : ""} ago</span></h2>
          {y.albums.length > 0 && <ul>{y.albums.map((a) => <li key={a.slug}>Album: <Link to={`/album/${a.slug}`}>{a.title}</Link> <span className="home-dim">{a.composer}</span></li>)}</ul>}
          {y.studies.length > 0 && <ul>{y.studies.map((s) => <li key={s.slug}>Study: <Link to={`/study/${s.slug}`}>{s.title}</Link> <span className="home-dim">{s.owner}</span></li>)}</ul>}
          {y.chat && (
            <>
              <p style={{ margin: "0.2rem 0", fontSize: "0.9rem" }}>
                {y.chat.count} message{y.chat.count > 1 ? "s" : ""} in{" "}
                {y.chat.channels.map((c, i) => <span key={c.slug}>{i > 0 && ", "}<Link to={`/topic/${c.slug}?day=${data.day.replace(/^\d{4}/, String(y.year))}`}>{c.name}</Link></span>)}
              </p>
              <ul>{y.chat.highlights.map((h) => <li key={h.id}><Link to={`/topic/${h.channelSlug}?day=${h.day}#m-${h.id}`}>“{h.text}”</Link> <span className="home-dim">{h.author}</span></li>)}</ul>
            </>
          )}
        </section>
      ))}
    </div>
  );
}
