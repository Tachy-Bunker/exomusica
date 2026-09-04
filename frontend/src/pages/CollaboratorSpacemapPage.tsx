import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { SpaceMap } from "../components/SpaceMap";
import type { Branch, PlayableTrackDTO } from "../lib/types";

interface DiscographyTrack {
  id: number;
  title: string;
  fileUrl: string;
  format: string;
  durationSeconds: number | null;
  position: number;
}

interface DiscographyAlbum {
  slug: string;
  title: string;
  coverArtUrl: string | null;
  branchSlug: string;
  tracks: DiscographyTrack[];
}

interface CollaboratorDetail {
  slug: string;
  name: string;
  discography: DiscographyAlbum[];
}

export function CollaboratorSpacemapPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [collaborator, setCollaborator] = useState<CollaboratorDetail | null>(null);
  const [allBranches, setAllBranches] = useState<Branch[] | null>(null);

  useEffect(() => {
    if (!slug) return;
    api<CollaboratorDetail>(`/api/collaborators/${slug}`).then(setCollaborator);
    api<Branch[]>("/api/branches").then(setAllBranches);
  }, [slug]);

  if (!collaborator || !allBranches) return <p>Loading…</p>;

  const branchSlugsInDiscography = new Set(collaborator.discography.map((a) => a.branchSlug));
  const filteredBranches = allBranches.filter((b) => branchSlugsInDiscography.has(b.slug));
  const filteredTracks: PlayableTrackDTO[] = collaborator.discography.flatMap((album) =>
    album.tracks.map((t) => ({
      id: t.id,
      title: t.title,
      fileUrl: t.fileUrl,
      format: t.format,
      durationSeconds: t.durationSeconds,
      position: t.position,
      albumTitle: album.title,
      albumSlug: album.slug,
      coverArtUrl: album.coverArtUrl,
      composer: collaborator.name,
      branchSlug: album.branchSlug,
      bookmarks: [],
    })),
  );

  return (
    <div style={{ height: "calc(100dvh - var(--nav-height, 3.6rem) - 3rem)", display: "flex", flexDirection: "column" }}>
      <button className="btn" onClick={() => navigate(`/collaborator/${collaborator.slug}`)} style={{ marginBottom: "0.5rem", alignSelf: "flex-start" }}>
        ← Back to {collaborator.name}'s profile
      </button>
      {filteredBranches.length === 0 ? (
        <p style={{ color: "var(--text-dim)" }}>No branches with credited tracks yet.</p>
      ) : (
        <div style={{ flex: 1, minHeight: 0 }}>
          <SpaceMap
            branches={filteredBranches}
            centerLabel={collaborator.name}
            centerHref={`/collaborator/${collaborator.slug}`}
            filteredTracks={filteredTracks}
          />
        </div>
      )}
    </div>
  );
}
