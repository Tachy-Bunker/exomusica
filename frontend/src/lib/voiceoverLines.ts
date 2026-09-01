export interface VoiceoverLine {
  duration: number; // seconds
  text: string;
}

// Matches lines like "<2.3> This is line one" — falls back to treating an
// unmatched line as plain text shown for a default duration, so existing
// plain voiceover text (no timing syntax) still works.
const LINE_PATTERN = /^<([\d.]+)>\s*(.*)$/;
const DEFAULT_DURATION = 3;

export function parseVoiceoverLines(raw: string): VoiceoverLine[] {
  const lines = raw.split("\n").filter((l) => l.trim() !== "");
  if (lines.length === 0) return [];
  return lines.map((line) => {
    const m = line.match(LINE_PATTERN);
    if (m) return { duration: Number(m[1]), text: m[2] };
    return { duration: DEFAULT_DURATION, text: line };
  });
}
