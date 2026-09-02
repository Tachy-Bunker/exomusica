import { getToken } from "./api";

export async function exportChatHistory(slug: string): Promise<void> {
  const res = await fetch(`/api/channels/${slug}/export`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  const text = await res.text();
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slug}-export.txt`;
  a.click();
  URL.revokeObjectURL(url);
}
