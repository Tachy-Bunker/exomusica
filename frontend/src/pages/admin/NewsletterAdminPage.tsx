import { useEffect, useState } from "react";
import { api } from "../../lib/api";

interface Subscription {
  id: number;
  email: string;
  confirmed: boolean;
  createdAt: string;
}

export function NewsletterAdminPage() {
  const [subs, setSubs] = useState<Subscription[]>([]);

  useEffect(() => {
    api<Subscription[]>("/api/admin/newsletter-subscriptions").then(setSubs);
  }, []);

  async function removeSubscriber(id: number) {
    if (!confirm("Unsubscribe this email?")) return;
    await api(`/api/admin/newsletter-subscriptions/${id}`, { method: "DELETE" });
    setSubs((prev) => prev.filter((s) => s.id !== id));
  }

  function exportTxt() {
    const text = subs.map((s) => s.email).join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `newsletter-subscribers-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <h1>Newsletter subscribers</h1>
      <p style={{ color: "var(--text-dim)" }}>{subs.length} subscribed</p>
      <button className="btn btn-primary" onClick={exportTxt} disabled={subs.length === 0} style={{ marginBottom: "1rem" }}>
        Export as TXT
      </button>
      <table>
        <thead>
          <tr>
            <th>Email</th>
            <th>Subscribed</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {subs.map((s) => (
            <tr key={s.id}>
              <td>{s.email}</td>
              <td className="mono">{new Date(s.createdAt).toLocaleDateString()}</td>
              <td>
                <button className="btn btn-danger" onClick={() => removeSubscriber(s.id)}>
                  Unsubscribe
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
