import { Link } from "react-router-dom";

/** Log is the wiki and the news in one place: two tabs, same section. */
export function LogTabs({ active }: { active: "pages" | "news" }) {
  return (
    <nav className="log-tabs" aria-label="Log">
      <Link to="/wiki" aria-current={active === "pages" ? "page" : undefined}>Pages</Link>
      <Link to="/news" aria-current={active === "news" ? "page" : undefined}>News</Link>
    </nav>
  );
}
