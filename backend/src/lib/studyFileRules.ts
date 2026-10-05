// Decisions about files that belong to a study (audio recordings, spectrogram
// images), kept free of database and disk code so they can be tested hard -
// this is the code that decides what gets DELETED, so it errs on the side of
// keeping things.

/** Study uploads are stored under /uploads/messages/<random-name>.<ext>, whatever host the link was written with. */
const UPLOAD_PATH = /\/uploads\/messages\/([A-Za-z0-9][A-Za-z0-9._-]*)/g;

/** Names of uploaded files referenced anywhere in a piece of text (a study body or a note). */
export function uploadedFileNames(text: string): Set<string> {
  const names = new Set<string>();
  for (const m of text.matchAll(UPLOAD_PATH)) names.add(m[1]);
  return names;
}

/** Files the old text referenced that the new text no longer does. */
export function removedFileNames(before: string, after: string): string[] {
  const still = uploadedFileNames(after);
  return [...uploadedFileNames(before)].filter((n) => !still.has(n));
}

export function fileNameOfStoragePath(storagePath: string): string | null {
  const m = storagePath.match(/^\/uploads\/messages\/([A-Za-z0-9][A-Za-z0-9._-]*)$/);
  return m ? m[1] : null;
}

/**
 * Uploads that were never saved into the study's text or notes (the author uploaded, then
 * cancelled or abandoned the edit). They're only swept after a grace period, so a file that's
 * merely waiting for its author to press Save is never deleted out from under them.
 */
export const ABANDONED_GRACE_MS = 6 * 60 * 60 * 1000;

export function abandonedFileIds(files: { id: number; storagePath: string; createdAt: Date }[], live: ReadonlySet<string>, now: Date, graceMs = ABANDONED_GRACE_MS): number[] {
  return files
    .filter((f) => {
      const name = fileNameOfStoragePath(f.storagePath);
      if (name === null) return false; // not something we manage - never touch it
      if (live.has(name)) return false;
      return now.getTime() - f.createdAt.getTime() >= graceMs;
    })
    .map((f) => f.id);
}

// ------------------------------------------------------------ upload validation

const AUDIO_EXT: Record<string, string> = {
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/wave": ".wav",
  "audio/ogg": ".ogg",
  "audio/flac": ".flac",
  "audio/x-flac": ".flac",
  "audio/mp4": ".m4a",
  "audio/x-m4a": ".m4a",
  "audio/aac": ".aac",
  "audio/webm": ".webm",
  "audio/opus": ".opus",
};
const IMAGE_EXT: Record<string, string> = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp" };

/**
 * A safe filename (with a clean extension) for a file being added to a study, or null if its type isn't
 * allowed. Only audio and PNG/JPEG/WebP images may be added - this isn't a general file host.
 */
export function safeStudyUploadName(filename: string, mimeType: string): string | null {
  let ext = IMAGE_EXT[mimeType] ?? AUDIO_EXT[mimeType];
  if (!ext && mimeType.startsWith("audio/")) {
    const fromName = filename.match(/\.[A-Za-z0-9]{2,5}$/)?.[0]?.toLowerCase();
    if (fromName) ext = fromName; // an audio type we don't have in the table, with a plain extension
  }
  if (!ext) return null;
  const dot = filename.lastIndexOf(".");
  const base = (dot > 0 ? filename.slice(0, dot) : dot === 0 ? "" : filename).replace(/[^A-Za-z0-9._ -]/g, "_").replace(/^\.+/, "").trim().slice(0, 60);
  return `${base || "file"}${ext}`;
}
