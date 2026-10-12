import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const key = (secret: string): Buffer => scryptSync(secret, "exomusica-outreach-v1", 32);

/** Seals a short secret (a mailbox password) so it is not readable in the database. AES-256-GCM; the key comes from the server's own secret. */
export function seal(plain: string, secret: string): string {
  if (!secret) throw new Error("Set OUTREACH_SECRET (or JWT_SECRET) on the server first");
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", key(secret), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1:${Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64")}`;
}
/** The secret back, or null if it was sealed with another key or has been altered. */
export function unseal(sealed: string | null | undefined, secret: string): string | null {
  if (!sealed || !sealed.startsWith("v1:") || !secret) return null;
  try {
    const raw = Buffer.from(sealed.slice(3), "base64");
    const d = createDecipheriv("aes-256-gcm", key(secret), raw.subarray(0, 12)); d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
  } catch { return null; }
}
