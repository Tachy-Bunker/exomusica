import { api } from "./api";

/**
 * Uploads a file INTO a study (an audio recording, a spectrogram). The server tags it to the study, which is
 * what lets it clean the file up when the note, the audio block, or the study itself goes away - so use this
 * rather than the general attachment upload, which would leave the file untracked. Counts against the
 * uploader's storage quota like any attachment. Returns the file's public URL.
 */
export interface UploadedStudyFile {
  id: number;
  url: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

/** Uploads a file into a study and returns everything the page needs to show it (name, type, size). */
export async function uploadStudyFileInfo(studySlug: string, file: Blob, filename: string): Promise<UploadedStudyFile> {
  const form = new FormData();
  form.append("file", file, filename);
  const res = await api<UploadedStudyFile>(`/api/studies/${studySlug}/files`, { method: "POST", body: form });
  if (!res?.url) throw new Error("upload failed");
  return res;
}

export async function uploadStudyFile(studySlug: string, file: Blob, filename: string): Promise<string> {
  return (await uploadStudyFileInfo(studySlug, file, filename)).url;
}
