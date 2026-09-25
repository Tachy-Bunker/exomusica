const STEPS = [
  { label: "Brief", caption: "read the concept" },
  { label: "Sketches", caption: "grab source material" },
  { label: "Submit", caption: "upload, credit, done" },
  { label: "Feedback", caption: "discuss with the team" },
  { label: "Official", caption: "goes live on the branch" },
];

export function ContributeTimeline() {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", marginBottom: "1.2rem", overflowX: "auto" }}>
      {STEPS.map((step, i) => (
        <div key={step.label} style={{ display: "flex", alignItems: "flex-start", flex: i < STEPS.length - 1 ? 1 : "0 0 auto" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 84 }}>
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: "var(--accent-forum-dim)",
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
