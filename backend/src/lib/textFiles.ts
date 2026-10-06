import { open } from "node:fs/promises";
import path from "node:path";

// Which uploaded files can be shown as text, and a careful reader for them. Previewing means reading bytes a stranger supplied, so
// this only ever returns text it is sure is text: valid UTF-8 (or UTF-16 with a byte-order mark), no control bytes, no binary.

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "csv", "tsv", "json", "jsonl", "ndjson", "xml", "yaml", "yml", "toml", "ini", "cfg", "conf", "log", "tex", "bib", "rst",
  "srt", "vtt", "lrc", "html", "htm", "css", "svg", "js", "mjs", "cjs", "ts", "tsx", "jsx", "py", "rb", "go", "rs", "c", "h", "cpp", "hpp", "cc", "cs",
  "java", "kt", "swift", "php", "sh", "bash", "zsh", "ps1", "bat", "cmd", "sql", "r", "m", "jl", "lua", "pl", "glsl", "wgsl", "vert", "frag",
  "cmajor", "cmajpatch", "cmajtest", "alterant", "scp", "patch", "diff", "env", "gitignore", "dockerfile", "makefile",
]);

export const TEXT_PREVIEW_BYTES = 256 * 1024;

export function isTextFile(filename: string, mimeType: string): boolean {
  const ext = path.extname(filename).slice(1).toLowerCase();
  if (ext) return TEXT_EXTENSIONS.has(ext) || (mimeType.startsWith("text/") && ext !== "rtf"); // rtf is "text/" by MIME type but is markup, not something to read
  return mimeType.startsWith("text/") || TEXT_EXTENSIONS.has(filename.toLowerCase());
}

/** Decodes bytes as text, or returns null if they aren't text. A character cut off at the very end (the file was truncated) is fine. */
export function decodeText(bytes: Uint8Array, truncated: boolean): string | null {
  if (bytes.length === 0) return "";
  const utf16le = bytes[0] === 0xff && bytes[1] === 0xfe;
  const utf16be = bytes[0] === 0xfe && bytes[1] === 0xff;
  if (!utf16le && !utf16be) for (const b of bytes) if (b === 0) return null; // a NUL byte means binary
  try {
    const decoder = new TextDecoder(utf16le ? "utf-16le" : utf16be ? "utf-16be" : "utf-8", { fatal: true });
    let text = decoder.decode(bytes, { stream: truncated });
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    // any other control character means this isn't something to read
    let control = 0;
    for (let i = 0; i < Math.min(text.length, 8192); i++) {
      const c = text.charCodeAt(i);
      if (c < 32 && c !== 9 && c !== 10 && c !== 13 && c !== 12 && c !== 27) control++; // tab, newlines, form feed and ESC (terminal colours in logs) are normal in text
    }
    if (control > 0) return null;
    return text;
  } catch {
    return null;
  }
}

/** The first part of a text file, for showing in the page. */
export async function readTextPreview(file: string, size: number): Promise<{ text: string; truncated: boolean } | null> {
  const handle = await open(file, "r");
  try {
    const want = Math.min(size, TEXT_PREVIEW_BYTES);
    const buf = Buffer.alloc(want);
    const { bytesRead } = await handle.read(buf, 0, want, 0);
    const truncated = size > TEXT_PREVIEW_BYTES;
    const text = decodeText(buf.subarray(0, bytesRead), truncated);
    return text === null ? null : { text, truncated };
  } finally {
    await handle.close();
  }
}
