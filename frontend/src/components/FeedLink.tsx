import { useEffect } from "react";

/** A small "Feed" link, plus the <link rel="alternate"> that lets feed readers find it from the page address. */
export function FeedLink({ href, title }: { href: string; title: string }) {
  useEffect(() => {
    const el = document.createElement("link");
    el.rel = "alternate"; el.type = "application/atom+xml"; el.title = title; el.href = href;
    document.head.appendChild(el);
    return () => { el.remove(); };
  }, [href, title]);
  return (
    <span className="feed-link" data-testid="feed-link">
      <a href={href} title="Follow this in a feed reader (Atom)">Feed</a>
      <a href={`${href}?format=json`} title="The same, as JSON Feed">JSON</a>
    </span>
  );
}
