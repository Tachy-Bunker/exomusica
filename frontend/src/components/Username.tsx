import { Link } from "react-router-dom";

/**
 * A member's name wherever it appears outside the chat itself: in the colour the admin chose (Fonts & Misc), and a link to their page.
 * When it sits in dimmed text it dims along with it (see .uname in the stylesheet).
 */
export function Username({ name, className }: { name: string; className?: string }) {
  return <Link className={className ? `uname ${className}` : "uname"} to={`/u/${encodeURIComponent(name)}`}>{name}</Link>;
}
