import { useMatch, useParams } from "react-router-dom";

/** Where a Playlist view gets its data and where its links point. The same pages (constellation /
 *  spacemap / list) serve real playlists and, read-only, a collaborator's discography. */
export function usePlaylistSource() {
  const { slug } = useParams<{ slug: string }>();
  const collab = !!useMatch("/collaborator/:slug/*");
  return {
    slug,
    collab,
    dataUrl: slug ? (collab ? `/api/collaborators/${slug}/playlist` : `/api/playlists/${slug}`) : "",
    mapPath: collab ? `/collaborator/${slug}/spacemap` : `/playlist/${slug}`,
    listPath: collab ? `/collaborator/${slug}/list` : `/playlist/${slug}/list`,
    backPath: collab ? `/collaborator/${slug}` : null,
  };
}

/** Link target for a "playing from" label; discography pseudo-playlists are `collab-<slug>`. */
export function playlistHref(slug: string): string {
  return slug.startsWith("collab-") ? `/collaborator/${slug.slice(7)}/spacemap` : `/playlist/${slug}`;
}
