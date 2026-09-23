import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { useDocumentTitle } from "../../lib/useDocumentTitle";

interface StudySummary {
  slug: string;
  title: string;
  status: "IN_PROGRESS" | "COMPLETE";
  owner: string;
  updatedAt: string;
}

export function StudiesAdminPage() {
  useDocumentTitle("Studies");
  const [studies, setStudies] = useState<StudySummary[]>([]);

  function load() {
    api<StudySummary[]>("/api/studies").then(setStudies);
  }
  useEffect(load, []);

  async function remove(slug: string) {
    if (!confirm("Delete this study permanently? This also removes its discussion channel link.")) return;
    await api(`/api/studies/${slug}`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      <h1>Studies</h1>
      <p style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>
        Every study on the site, regardless of who started it. Open one to edit its text, notes, or charts directly -
        admins can edit any study the same way its own author can.
      </p>
      <table style={{ width: "100%", fontSize: "0.85rem", borderCollapse: "collapse", marginTop: "0.8rem" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Title</th>
            <th style={{ textAlign: "left" }}>Author</th>
            <th style={{ textAlign: "left" }}>Status</th>
            <th style={{ textAlign: "left" }}>Updated</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {studies.map((s) => (
            <tr key={s.slug} style={{ borderTop: "1px solid var(--border)" }}>
              <td>
                <Link to={`/study/${s.slug}`}>{s.title}</Link>
              </td>
              <td style={{ color: "var(--text-dim)" }}>{s.owner}</td>
              <td>{s.status === "COMPLETE" ? "Complete" : "In progress"}</td>
              <td style={{ color: "var(--text-dim)" }}>{new Date(s.updatedAt).toLocaleDateString()}</td>
              <td>
                <button className="btn btn-danger" style={{ fontSize: "0.75rem" }} onClick={() => remove(s.slug)}>
                  delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
