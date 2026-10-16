// A room's terminal shows the website. The page opens in a frame inside the room, and the frame knows it is a terminal from its window name:
// a name survives every move inside the frame (a query string would be lost on the first link), and only the frame we open carries it.
const PREFIX = "exomusica-terminal:";
const SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/i;

export interface TerminalCtx { room: string; albums: string[] }

/** The window name of a terminal frame for this room: the room, and the albums that belong to it. */
export function terminalName(ctx: TerminalCtx): string { return `${PREFIX}${ctx.room}|${ctx.albums.join(",")}`; }

/** The room a window belongs to, when it is a terminal frame. Null for every ordinary page. */
export function terminalCtx(name: string): TerminalCtx | null {
  if (!name.startsWith(PREFIX)) return null;
  const [room = "", albums = ""] = name.slice(PREFIX.length).split("|");
  if (!SLUG.test(room)) return null;
  return { room, albums: albums.split(",").filter((s) => SLUG.test(s)) };
}

/** Where a terminal may go: this room's branch page and its albums, XenoLab, and the Log (the wiki, news and studies). Anything else is the rest of the site, reached by leaving the terminal. */
export function terminalAllows(pathname: string, ctx: TerminalCtx): boolean {
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (p === "/xenolab" || p.startsWith("/xenolab/")) return true;
  if (p === "/wiki" || p.startsWith("/wiki/") || p === "/news" || p.startsWith("/news/") || p.startsWith("/study/")) return true;
  if (p === `/branch/${ctx.room}`) return true;
  const album = /^\/album\/([^/]+)$/.exec(p);
  return !!album && ctx.albums.includes(album[1]);
}

/** The pages a room's logbook opens in its terminal. */
export function terminalSites(room: string, roomName: string): { path: string; title: string }[] {
  return [
    { path: `/branch/${room}`, title: roomName },
    { path: "/xenolab", title: "XenoLab" },
    { path: "/wiki", title: "Log" },
  ];
}
