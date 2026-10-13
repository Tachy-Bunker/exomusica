/** A loading line with a slow condensation wipe over it (one compositor-only animation). Static under classic mode and reduced motion. */
export function Loading({ className = "home-dim" }: { className?: string }) {
  return <p className={`${className} fog-load`} role="status">Loading…</p>;
}
