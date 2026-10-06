import path from "node:path";

// Everything under /uploads/ is user-supplied and is served from the site's own origin. A file the browser treats as a web page
// (HTML, SVG, XML...) and opens directly would run its scripts with the site's privileges - able to read the visitor's login
// token. These headers make that impossible, whatever a file is named or contains.

/** Types that are safe for a browser to show or play in place. Everything else is downloaded instead. */
const SHOWN_IN_PLACE = new Set([
  ".png", ".apng", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".bmp", ".ico",
  ".mp3", ".wav", ".ogg", ".oga", ".opus", ".m4a", ".aac", ".flac", ".weba",
  ".mp4", ".webm", ".mov", ".m4v", ".ogv",
  ".pdf",
  ".woff", ".woff2", ".ttf", ".otf",
]);

export function uploadHeaders(filePath: string): Record<string, string> {
  const ext = path.extname(filePath).toLowerCase();
  // never let a browser guess a different type from the content
  const headers: Record<string, string> = { "X-Content-Type-Options": "nosniff" };
  if (ext === ".svg" || ext === ".svgz") {
    // fine as an <img>, but opened on its own it could run script: this turns scripts and same-origin access off
    headers["Content-Security-Policy"] = "sandbox";
  } else if (!SHOWN_IN_PLACE.has(ext)) {
    headers["Content-Disposition"] = "attachment";
    headers["Content-Security-Policy"] = "sandbox";
  }
  return headers;
}
