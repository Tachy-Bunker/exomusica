import { plainExcerpt } from "./publicChannels.js";

export interface MemberRow { username: string; avatarUrl: string | null; bio: string | null; createdAt: Date; studies: number; messages: number }
export interface Member { username: string; avatarUrl: string | null; bio: string; joinedAt: number; studies: number; messages: number }

/** Exactly what a public profile already shows (name, picture, bio, join date), plus two counts. Nothing private. */
export const shapeMember = (r: MemberRow): Member => ({
  username: r.username,
  avatarUrl: r.avatarUrl,
  bio: plainExcerpt(r.bio ?? "", 140),
  joinedAt: r.createdAt.getTime(),
  studies: r.studies,
  messages: r.messages,
});
