// XenoLab's sections. The address says which one is open (?tab=), so each can be linked and the back button works.
export type LabTab = "studies" | "resources" | "analyze" | "effects" | "open" | "contribute";
export const LAB_TABS: { id: LabTab; label: string }[] = [
  { id: "studies", label: "Studies" },
  { id: "resources", label: "Resources" },
  { id: "analyze", label: "Analyze" },
  { id: "effects", label: "Effects" },
  { id: "open", label: "Open calls" },
  { id: "contribute", label: "Contribute" },
];
// Addresses from before the tabs were renamed keep working.
const OLD_TABS: Record<string, LabTab> = { overview: "studies", samples: "resources", voice: "effects", challenges: "open", log: "studies" };
export function parseTab(value: string | null): LabTab {
  if (LAB_TABS.some((t) => t.id === value)) return value as LabTab;
  return (value && OLD_TABS[value]) || "studies";
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
