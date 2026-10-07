export type ContributeStepKey = "choose" | "brief" | "sketches" | "submit" | "feedback" | "official";

/** The steps, in the words of what actually happens. Review is a person's decision: the last step says "if approved", never "goes live". */
export const CONTRIBUTE_STEPS: { key: ContributeStepKey; label: string; caption: string }[] = [
  { key: "choose", label: "Choose", caption: "pick a branch" },
  { key: "brief", label: "Brief", caption: "read the concept" },
  { key: "sketches", label: "Sketches", caption: "get source material" },
  { key: "submit", label: "Submit", caption: "upload and credit" },
  { key: "feedback", label: "Review", caption: "the team listens and replies" },
  { key: "official", label: "If approved", caption: "added to the branch" },
];

interface Props {
  activeStep: ContributeStepKey | null;
  onStepChange: (key: ContributeStepKey | null) => void;
}

/** Each step is a real button: press it to see where on the page it happens. It works with the keyboard and on touch (no hover needed). */
export function ContributeTimeline({ activeStep, onStepChange }: Props) {
  return (
    <ol className="ct-steps" aria-label="How contributing works" data-testid="contribute-steps">
      {CONTRIBUTE_STEPS.map((step, i) => (
        <li key={step.key}>
          <button type="button" className="ct-step" aria-pressed={activeStep === step.key} onClick={() => onStepChange(activeStep === step.key ? null : step.key)} data-testid={`step-${step.key}`}>
            <span className="ct-step-n" aria-hidden="true">{i + 1}</span>
            <span className="ct-step-label">{step.label}</span>
            <span className="ct-step-caption">{step.caption}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}
