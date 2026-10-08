/** How strongly a background picture shows. `value` null = the soft default; the slider moves in whole percent steps. */
export function OpacitySlider({ value, fallback = 0.17, onChange, label = "Picture strength", disabled = false }: { value: number | null | undefined; fallback?: number; onChange: (v: number | null) => void; label?: string; disabled?: boolean }) {
  const v = value ?? fallback;
  return (
    <label className="opacity-slider" data-testid="opacity-slider">
      <span>{label}</span>
      <input type="range" min={5} max={90} step={1} value={Math.round(v * 100)} disabled={disabled} onChange={(e) => onChange(Number(e.target.value) / 100)} aria-valuetext={`${Math.round(v * 100)} percent`} />
      <output>{Math.round(v * 100)}%</output>
      {value != null && <button type="button" className="link-btn" disabled={disabled} onClick={() => onChange(null)}>reset</button>}
    </label>
  );
}
