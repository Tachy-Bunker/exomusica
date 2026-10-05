// Files a study's text points at, and whether they still exist. Mirrors the server's rule for what counts as a study file.

const UPLOAD_PATH = /\/uploads\/messages\/([A-Za-z0-9][A-Za-z0-9._-]*)/g;

/** Site-relative URLs of uploaded files mentioned in text (absolute links on this site are normalised). */
export function uploadedFileUrls(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(UPLOAD_PATH)) out.add(`/uploads/messages/${m[1]}`);
  return [...out];
}

/** Which of these files the server no longer has. Network failures count as "unknown", not "missing". */
export async function findMissingFiles(urls: string[]): Promise<string[]> {
  const checks = await Promise.all(
    urls.slice(0, 12).map(async (url) => {
      try {
        const res = await fetch(url, { method: "HEAD" });
        return res.status === 404 ? url : null;
      } catch {
        return null;
      }
    }),
  );
  return checks.filter((u): u is string => u !== null);
}
