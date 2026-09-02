// This is the one contract the forum backend and the future audio player
// both depend on. Wherever a track can be handed to the player — a forum
// message embed today, an album page or search result later — it arrives
// in this shape. The player store only needs to know this one type.
export interface PlayableTrackDTO {
  id: number;
  title: string;
  fileUrl: string;
  format: string;
  durationSeconds: number | null;
  position: number;
  albumTitle: string;
  albumSlug: string;
  coverArtUrl: string | null;
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
