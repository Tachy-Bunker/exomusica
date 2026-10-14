/** The excavation header on an archived day: "Recovered 2023-04-12 · #drones · 37 entries". Pure so it is easy to test. */
export function recoveredHeader(day: string, channelSlug: string, entries: number | null, now = new Date()): { title: string; sub: string } {
  const d = new Date(`${day}T00:00:00Z`);
  const valid = !Number.isNaN(d.getTime());
  const days = valid ? Math.floor((now.getTime() - d.getTime()) / 86_400_000) : 0;
  const age = !valid ? "" : days < 1 ? "today" : days < 60 ? `${days} day${days === 1 ? "" : "s"} down` : days < 730 ? `${Math.round(days / 30)} months down` : `${(days / 365).toFixed(1).replace(/\.0$/, "")} years down`;
  return {
    title: `Recovered: ${day}, #${channelSlug}`,
    sub: [entries === null ? null : `${entries} ${entries === 1 ? "entry" : "entries"} decoded`, age].filter(Boolean).join(" · "),
  };
}
