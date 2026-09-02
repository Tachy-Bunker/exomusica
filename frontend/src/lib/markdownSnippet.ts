export function snippetFor(mimeType: string, url: string, filename: string): string {
  if (mimeType.startsWith("image/")) return `![${filename}](${url})`;
  if (mimeType.startsWith("audio/")) return `@audio(${url})`;
  if (mimeType.startsWith("video/")) return `@video(${url})`;
  return `@file(${url})[${filename}]`;
}
