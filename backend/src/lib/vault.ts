// Founders' door (milestone m-founders): the earliest recovered Discord logs, as a timeline. Public channels only, plain text only.
import { isPublicChannel, plainExcerpt, type ChannelLike } from "./publicChannels.js";

export const VAULT_MAX = 80;
export interface VaultRow { id: number; createdAt: Date; contentRaw: string; author: { username: string }; channel: ChannelLike & { name: string } }
export interface VaultEntry { id: number; at: number; author: string; channel: string; text: string }

export function buildVault(rows: VaultRow[], max = VAULT_MAX): VaultEntry[] {
  const out: VaultEntry[] = [];
  for (const r of rows) {
    if (!isPublicChannel(r.channel)) continue;
    const text = plainExcerpt(r.contentRaw, 240);
    if (!text) continue;
    out.push({ id: r.id, at: Math.floor(r.createdAt.getTime() / 1000), author: r.author.username, channel: r.channel.name, text });
    if (out.length >= max) break;
  }
  return out;
}
