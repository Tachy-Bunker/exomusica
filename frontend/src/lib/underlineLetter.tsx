import type { ReactNode } from "react";

export function underlineLetter(word: string, letter: string): ReactNode {
  const idx = word.toLowerCase().indexOf(letter.toLowerCase());
  if (idx === -1) return word;
  return (
    <>
      <span style={{ textDecoration: "none" }}>{word.slice(0, idx)}</span>
      <span style={{ textDecoration: "underline" }}>{word[idx]}</span>
      <span style={{ textDecoration: "none" }}>{word.slice(idx + 1)}</span>
    </>
  );
}
