// XenoLab's sections. The address says which one is open (?tab=), so each can be linked and the back button works.
export type LabTab = "overview" | "studies" | "analyze" | "voice" | "samples" | "challenges" | "log";
export const LAB_TABS: { id: LabTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "studies", label: "Studies" },
  { id: "analyze", label: "Analyze" },
  { id: "voice", label: "Voice lab" },
  { id: "samples", label: "Samples" },
  { id: "challenges", label: "Challenges" },
  { id: "log", label: "Log" },
];
export function parseTab(value: string | null): LabTab {
  return LAB_TABS.some((t) => t.id === value) ? (value as LabTab) : "overview";
}

export interface StudyCard { slug: string; title: string; excerpt?: string; status: "IN_PROGRESS" | "COMPLETE"; owner: string; updatedAt: string }

export type StudyFilter = "all" | "mine" | "progress" | "complete";
export function filterStudies(list: StudyCard[], filter: StudyFilter, query: string, me: string | null): StudyCard[] {
  const q = query.trim().toLowerCase();
  return list.filter((s) => {
    if (filter === "mine" && s.owner !== me) return false;
    if (filter === "progress" && s.status !== "IN_PROGRESS") return false;
    if (filter === "complete" && s.status !== "COMPLETE") return false;
    return !q || `${s.title} ${s.owner} ${s.excerpt ?? ""}`.toLowerCase().includes(q);
  });
}

/** The study to offer as "Continue": your own unfinished one touched most recently. */
export function studyToContinue(list: StudyCard[], me: string | null): StudyCard | null {
  if (!me) return null;
  return list.filter((s) => s.owner === me && s.status === "IN_PROGRESS").sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0] ?? null;
}
