import { api, ApiError } from "./api";

/** Voice notes are named by when they were recorded, so a chat's files list makes sense: voice-note-20261006-143207.m4a */
export function voiceNoteFilename(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `voice-note-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}.m4a`;
}

/** Is this attachment a voice note? (So chat can show it as one rather than as a bare file.) */
export const isVoiceNoteName = (filename: string) => /^voice-note.*\.m4a$/i.test(filename);

export interface UploadedChatAttachment {
  id: number;
  filename: string;
  url: string;
  sizeBytes: number;
}

/** Uploads one file as a chat attachment (it is attached to a message afterwards, by its id). */
export async function uploadChatAttachment(blob: Blob, filename: string): Promise<UploadedChatAttachment> {
  const form = new FormData();
  form.append("files", new File([blob], filename, { type: blob.type || "audio/mp4" }));
  let res: { created: UploadedChatAttachment[]; errors?: string[] } | undefined;
  try {
    res = await api<{ created: UploadedChatAttachment[]; errors?: string[] }>("/api/attachments", { method: "POST", body: form });
  } catch (e) {
    // when every file fails, the server answers with an error plus the per-file reasons ("<file>: this would push you over your storage limit")
    const reason = e instanceof ApiError ? (e.body as { details?: string[] } | undefined)?.details?.[0] : undefined;
    if (reason) throw new Error(reason.replace(/^[^:]*:\s*/, ""));
    throw e;
  }
  const made = res?.created?.[0];
  if (!made) throw new Error(res?.errors?.[0]?.replace(/^[^:]*:\s*/, "") || "The voice note couldn't be uploaded.");
  return made;
}
