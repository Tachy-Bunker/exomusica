// Starting points for a new study, so nobody faces a blank page.
export interface StudyTemplate { id: string; name: string; hint: string; body: string }

export const STUDY_TEMPLATES: StudyTemplate[] = [
  { id: "blank", name: "Blank", hint: "Start from nothing.", body: "" },
  { id: "listening", name: "Listening notes", hint: "What you heard, what stood out, what you still wonder.", body: "## What I listened to\n\n\n## What I noticed\n\n\n## Questions I still have\n\n" },
  { id: "experiment", name: "Experiment", hint: "A question, how you tested it, what happened.", body: "## Question\n\n\n## Method\n\n\n## Result\n\n\n## What it means\n\n" },
  { id: "compare", name: "A / B comparison", hint: "Two versions of a sound, and what separates them.", body: "## A\n\n\n## B\n\n\n## Differences I hear\n\n\n## Verdict\n\n" },
  { id: "analysis", name: "Sound analysis", hint: "Measure a sound in the Analyzer, then read the numbers here.", body: "## The sound\n\n\n## Measurements\n\n_Paste the Analyzer's notes here (Analyze > Copy as notes)._\n\n\n## Reading them\n\n" },
];

export const templateById = (id: string): StudyTemplate => STUDY_TEMPLATES.find((t) => t.id === id) ?? STUDY_TEMPLATES[0];
