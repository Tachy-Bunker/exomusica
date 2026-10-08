import { api } from "../lib/api";
import type { UploadedStudyFile } from "../lib/uploadAttachment";
import { articleAudio, articleFile } from "./ArticleView";
import { StudyEditor } from "./StudyEditor";

// News posts and wiki pages are written in the same editor as studies (pictures with resizing, audio, files, an outline, a live preview that
// scrolls with the text). Their files go to the admin media folder instead of a study. Footnote notes are a study thing, so that tray is left out.

async function uploadMedia(blob: Blob, filename: string): Promise<UploadedStudyFile> {
  const form = new FormData();
  form.append("file", blob, filename);
  const r = await api<{ url: string; mimeType: string; filename: string }>("/api/admin/media", { method: "POST", body: form });
  if (!r?.url) throw new Error("upload failed");
  return { id: 0, url: r.url, filename: r.filename, mimeType: r.mimeType, sizeBytes: blob.size };
}

const noNote = async () => {};

export function ArticleEditor({ body, onBodyChange, onNavigate }: { body: string; onBodyChange: (next: string) => void; onNavigate: (path: string) => void }) {
  return (
    <StudyEditor
      body={body}
      onBodyChange={onBodyChange}
      notes={[]}
      charts={[]}
      hideNotes
      renderAudio={articleAudio}
      uploadFile={async (blob, name) => (await uploadMedia(blob, name)).url}
      uploadFileInfo={uploadMedia}
      renderFile={articleFile}
      onAddNote={noNote}
      onNavigate={onNavigate}
    />
  );
}
