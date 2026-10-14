// Replacing the recording a study is built around. The study's text points at its audio in two places:
// an `@audio(url)` block in the body, and `{clip:start-end url img=...}` inside the notes that cite a slice.
// Swapping the URL in both keeps every marker where it was. A clip's spectrogram picture (img=) belongs to the
// old sound, so it is dropped; readers see the plain clip and the author can redraw it.

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export interface SwapResult { text: string; blocks: number; clips: number }

export function swapStudyAudio(text: string, from: string, to: string): SwapResult {
  let blocks = 0;
  let clips = 0;
  const f = esc(from);
  let out = text.replace(new RegExp(`^@audio\\(${f}\\)`, "gm"), () => { blocks++; return `@audio(${to})`; });
  out = out.replace(new RegExp(`\\{clip:(\\d+(?:\\.\\d+)?-\\d+(?:\\.\\d+)?) ${f}(?: img=\\S+?)?\\}`, "g"), (_m, range: string) => { clips++; return `{clip:${range} ${to}}`; });
  return { text: out, blocks, clips };
}

/** Every distinct audio URL a study uses, in order of first appearance: what the "replace audio" picker offers. */
export function studyAudioUrls(texts: string[]): string[] {
  const seen: string[] = [];
  for (const t of texts) {
    for (const m of t.matchAll(/^@audio\((\S+?)\)/gm)) if (!seen.includes(m[1])) seen.push(m[1]);
    for (const m of t.matchAll(/\{clip:\d+(?:\.\d+)?-\d+(?:\.\d+)? (\S+?)(?: img=\S+?)?\}/g)) if (!seen.includes(m[1])) seen.push(m[1]);
  }
  return seen;
}
