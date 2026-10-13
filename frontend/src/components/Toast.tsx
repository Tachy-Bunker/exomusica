import { useEffect } from "react";
import { useToastStore } from "../lib/toastStore";

export function Toast() {
  const message = useToastStore((s) => s.message);
  const action = useToastStore((s) => s.action);
  const clear = useToastStore((s) => s.clear);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(clear, action ? 8000 : 2200);
    return () => clearTimeout(timer);
  }, [message, action, clear]);

  if (!message) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: "1.2rem",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        background: "var(--bg-elevated)",
        border: "1px solid var(--accent-audio)",
        color: "var(--text)",
        borderRadius: "var(--radius)",
        padding: "0.5rem 1rem",
        fontSize: "0.85rem",
        pointerEvents: action ? "auto" : "none",
      }}
    >
      {message}
      {action && <button className="btn" style={{ marginLeft: "0.7rem", padding: "0.1rem 0.5rem" }} data-testid="toast-action" onClick={() => { action.run(); clear(); }}>{action.label}</button>}
    </div>
  );
}
