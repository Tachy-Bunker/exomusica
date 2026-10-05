import { api } from "./api";

/** Uploads one file through the site's normal attachment route (counts against the user's storage quota). Returns its public URL. */
export async function uploadAttachment(file: Blob, filename: string): Promise<string> {
  const form = new FormData();
  form.append("file", file, filename);
  const res = await api<{ created: { url: string }[]; errors?: string[] }>("/api/attachments", { method: "POST", body: form });
  const url = res.created?.[0]?.url;
  if (!url) throw new Error(res.errors?.[0] ?? "upload failed");
  return url;
}
