export function Avatar({ url, size = 32 }: { url: string | null | undefined; size?: number }) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", border: "1px solid var(--border)" }}
      />
    );
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      style={{ borderRadius: "50%", border: "1px solid var(--border)", background: "var(--bg-inset)" }}
    >
      <circle cx="16" cy="12" r="6" fill="var(--text-dim)" />
      <path d="M4 29c0-7 5.4-11 12-11s12 4 12 11" fill="var(--text-dim)" />
    </svg>
  );
}
