const KEY = "exomusica_seen_branch_intros";

function getSeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

export function hasSeenBranchIntro(slug: string): boolean {
  return getSeen().has(slug);
}

export function markBranchIntroSeen(slug: string): void {
  const seen = getSeen();
  seen.add(slug);
  localStorage.setItem(KEY, JSON.stringify([...seen]));
}
