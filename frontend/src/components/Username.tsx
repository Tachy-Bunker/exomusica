import { Link } from "react-router-dom";
import { DmButton } from "./DmButton";

/**
 * A member's name wherever it appears outside the chat itself: in the colour the admin chose (Fonts & Misc), and a link to their page.
 * When it sits in dimmed text it dims along with it (see .uname in the stylesheet).
 */
export function Username({ name, className, dm = false }: { name: string; className?: string; dm?: boolean }) {
  const link = <Link className={className ? `uname ${className}` : "uname"} to={`/u/${encodeURIComponent(name)}`}>{name}</Link>;
  return dm ? <>{link}<DmButton username={name} /></> : link;
}
