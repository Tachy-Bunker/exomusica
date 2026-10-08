// A short plain-text preview of a study's writing, for the cards in XenoLab.
export function studyExcerpt(body: string, max = 150): string {
  const text = body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\{clip:[^}]*\}/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s*\|.*\|\s*$/gm, " ")
    .replace(/^[#>\-*\s]+/gm, "")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return cut.slice(0, Math.max(40, cut.lastIndexOf(" "))).trimEnd() + "…";
}
