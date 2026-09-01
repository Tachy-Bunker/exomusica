import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { Branch } from "../lib/types";

export function BranchIndexList() {
  const [branches, setBranches] = useState<Branch[]>([]);

  useEffect(() => {
    api<Branch[]>("/api/branches").then(setBranches);
  }, []);

  if (branches.length === 0) return <p style={{ color: "var(--text-dim)" }}>No branches yet.</p>;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "1rem" }}>
      {branches.map((b) => (
        <div key={b.id} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.8rem" }}>
          <Link to={`/branch/${b.slug}`} style={{ fontFamily: "var(--font-display)", fontSize: "1.05rem" }}>
            {b.name}
          </Link>
          {b.description && <p style={{ fontSize: "0.85rem", color: "var(--text-dim)", marginTop: "0.3rem" }}>{b.description}</p>}
        </div>
      ))}
    </div>
  );
}
