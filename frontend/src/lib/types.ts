export interface PlayableTrackDTO {
  id: number;
  title: string;
  fileUrl: string;
  format: string;
  durationSeconds: number | null;
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
  contentRaw: string;
  attachmentId: number | null;
  isDeleted: boolean;
  editedAt: number | null;
  reactions: { emojiId: number; emojiName: string; userIds: number[] }[];
  embeds: PlayableTrackDTO[];
}

export interface Branch {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  coverArtUrl: string | null;
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
