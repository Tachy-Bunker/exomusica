export interface PlayableTrackDTO {
  id: number;
  title: string;
  fileUrl: string;
  format: string;
  durationSeconds: number | null;
  position: number;
  albumTitle: string;
  albumSlug: string;
  composer: string;
  branchSlug: string;
  bookmarks: { label: string; timestampSeconds: number }[];
}

export interface MessageDTO {
  id: number;
  channelId: number;
  authorId: number;
  authorUsername: string;
  authorAvatarUrl: string | null;
  unixTimestamp: number;
  replyToId: number | null;
  replyPreview: { id: number; authorUsername: string; excerpt: string } | null;
  contentRaw: string;
  attachments: { id: number; filename: string; url: string; sizeBytes: number }[];
  isDeleted: boolean;
  editedAt: number | null;
  reactions: { emojiId: number; emojiName: string; usernames: string[] }[];
  embeds: PlayableTrackDTO[];
}

export interface Branch {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  coverArtUrl: string | null;
  hidden?: boolean; // only present on the admin listing, not the public one
  fontId?: number | null;
  font?: { familyName: string; fileUrl: string; format: string } | null;
  parentId: number | null;
  posX: number | null;
  posY: number | null;
  channel: { slug: string } | null;
}

export interface BranchAlbum {
  id: number;
  slug: string;
  title: string;
  composer: string;
  coverArtUrl: string | null;
  previewTrack: PlayableTrackDTO | null;
}
