export type ContributeStepKey = "brief" | "sketches" | "submit" | "feedback" | "official";

const STEPS: { key: ContributeStepKey; label: string; caption: string }[] = [
  { key: "brief", label: "Brief", caption: "read the concept" },
  { key: "sketches", label: "Sketches", caption: "grab source material" },
  { key: "submit", label: "Submit", caption: "upload, credit, done" },
  { key: "feedback", label: "Feedback", caption: "discuss with the team" },
  { key: "official", label: "Official", caption: "goes live on the branch" },
];

interface Props {
  activeStep: ContributeStepKey | null;
  onStepChange: (key: ContributeStepKey | null) => void;
}

export function ContributeTimeline({ activeStep, onStepChange }: Props) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", marginBottom: "1.2rem", overflowX: "auto" }}>
      {STEPS.map((step, i) => (
        <div key={step.key} style={{ display: "flex", alignItems: "flex-start", flex: i < STEPS.length - 1 ? 1 : "0 0 auto" }}>
          <div
            onMouseEnter={() => onStepChange(step.key)}
            onMouseLeave={() => {
              if (activeStep === step.key) onStepChange(null);
            }}
            onClick={() => onStepChange(activeStep === step.key ? null : step.key)}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              minWidth: 84,
              cursor: "pointer",
              padding: "0.3rem",
              borderRadius: "var(--radius)",
              background: activeStep === step.key ? "var(--bg-elevated)" : "transparent",
            }}
          >
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: activeStep === step.key ? "var(--accent-forum)" : "var(--accent-forum-dim)",
                border: "1px solid var(--accent-forum)",
                color: "var(--text)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.75rem",
                flexShrink: 0,
              }}
            >
              {i + 1}
            </span>
            <span style={{ fontWeight: 600, fontSize: "0.85rem", marginTop: "0.3rem", color: "var(--text)" }}>{step.label}</span>
            <span style={{ fontSize: "0.7rem", color: "var(--text-dim)", textAlign: "center" }}>{step.caption}</span>
          </div>
          {i < STEPS.length - 1 && <div style={{ flex: 1, height: 1, background: "var(--border)", marginTop: 11 }} />}
        </div>
      ))}
    </div>
  );
}
