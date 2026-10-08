export const STATUS_LABEL: Record<string, string> = { open: "open", testing: "being tested", supported: "supported", contested: "contested", refuted: "refuted", inconclusive: "inconclusive" };
export const STATUS_ORDER = ["open", "testing", "supported", "contested", "refuted", "inconclusive"];
export interface Tally { n: number; claim: number; other: number; unsure: number; informative: number; share: number | null; p: number | null }
export interface HypCard { id: number; title: string; claim: string; status: string; requirements: string[]; author: string; testable: boolean; n: number; tally: Tally | null; answered: boolean }
export interface HypDetail extends HypCard {
  protocol: string; question: string | null; statusNote: string | null; study: { slug: string; title: string } | null;
  stimulusA: string | null; stimulusB: string | null; suggested: string | null; canEdit: boolean; isAuthor: boolean;
  mine: { pick: string } | null; notes: { note: string; pick: string; by: string | null; createdAt: string }[];
}
export const pct = (t: Tally | null): string => (t && t.share !== null ? `${Math.round(t.share * 100)}%` : "–");
export const pText = (p: number | null): string => (p === null ? "" : p < 0.001 ? "p < 0.001" : `p = ${p.toFixed(3)}`);
