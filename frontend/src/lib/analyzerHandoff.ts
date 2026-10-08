// A file picked on one XenoLab tab and analyzed on another: a File cannot travel in an address, so it waits here for the Analyzer to take it.
export type AnalyzeSource = { blob: Blob; name: string };
let pending: AnalyzeSource | null = null;
export const setPendingAnalysis = (s: AnalyzeSource) => { pending = s; };
export function takePendingAnalysis(): AnalyzeSource | null { const p = pending; pending = null; return p; }
