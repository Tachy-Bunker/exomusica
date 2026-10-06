// What kind of file is it, for showing a file card in a study. (The server makes the same call before it will preview a file.)

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "csv", "tsv", "json", "jsonl", "ndjson", "xml", "yaml", "yml", "toml", "ini", "cfg", "conf", "log", "tex", "bib", "rst",
  "srt", "vtt", "lrc", "html", "htm", "css", "svg", "js", "mjs", "cjs", "ts", "tsx", "jsx", "py", "rb", "go", "rs", "c", "h", "cpp", "hpp", "cc", "cs",
  "java", "kt", "swift", "php", "sh", "bash", "zsh", "ps1", "bat", "cmd", "sql", "r", "m", "jl", "lua", "pl", "glsl", "wgsl", "vert", "frag",
  "cmajor", "cmajpatch", "cmajtest", "alterant", "scp", "patch", "diff", "env", "gitignore", "dockerfile", "makefile",
]);

const extOf = (name: string) => (name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "");

export function isTextName(name: string, mimeType = ""): boolean {
  const ext = extOf(name);
  if (ext) return TEXT_EXTENSIONS.has(ext) || (mimeType.startsWith("text/") && ext !== "rtf");
  return mimeType.startsWith("text/") || TEXT_EXTENSIONS.has(name.toLowerCase());
}

export const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif"]);
export const isImageFile = (file: { type: string; name: string }) => file.type.startsWith("image/") && IMAGE_EXTENSIONS.has(extOf(file.name) || file.type.slice(6).replace("jpeg", "jpg"));

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
}

export function fileIcon(name: string): string {
  const ext = extOf(name);
  if (["zip", "gz", "tar", "7z", "rar", "bz2", "xz"].includes(ext)) return "🗜";
  if (["pdf"].includes(ext)) return "📕";
  if (["wav", "mp3", "flac", "ogg", "m4a", "aac", "aif", "aiff", "opus", "mid", "midi"].includes(ext)) return "🎵";
  if (["xls", "xlsx", "ods", "csv", "tsv"].includes(ext)) return "📊";
  if (["doc", "docx", "odt", "rtf"].includes(ext)) return "📄";
  if (isTextName(name)) return "📝";
  return "📎";
}
