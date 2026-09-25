import { useState } from "react";

const STEPS = [
  { label: "Brief", detail: "Read the branch's concept - what it's going for, what's already there." },
  { label: "Sketches", detail: "Download curated chat attachments as source material or inspiration." },
  { label: "Submit", detail: "Upload your tracks, credit every artist, and it's in." },
  { label: "Feedback", detail: "A private discussion opens with the team - real notes, back and forth." },
  { label: "Official", detail: "Approved work moves into the branch's real, official page." },
];

export function ContributeTimeline() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1.2rem" }}>
      {STEPS.map((step, i) => (
        <button
          key={step.label}
          onClick={() => setOpenIndex((cur) => (cur === i ? null : i))}
          style={{
            flex: "1 1 140px",
            textAlign: "left",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: "0.6rem 0.7rem",
            background: openIndex === i ? "var(--bg-elevated)" : "transparent",
            cursor: "pointer",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <span
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: "var(--accent-forum-dim)",
                border: "1px solid var(--accent-forum)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.72rem",
                flexShrink: 0,
              }}
            >
              {i + 1}
            </span>
            <span style={{ fontWeight: 600 }}>{step.label}</span>
          </div>
          {openIndex === i && <p style={{ fontSize: "0.78rem", color: "var(--text-dim)", margin: "0.4rem 0 0" }}>{step.detail}</p>}
        </button>
      ))}
    </div>
  );
}
