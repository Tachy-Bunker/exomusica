import { useEffect, useRef, useState } from "react";

interface ArchiveDay {
  day: string; // "YYYY-MM-DD"
  messageCount: number;
}

interface Props {
  archiveDays: ArchiveDay[];
  selectedDay: string | null;
  onSelect: (day: string) => void;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toKey(y: number, m: number, d: number): string {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

export function ArchiveCalendar({ archiveDays, selectedDay, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const activeDays = useRef<Set<string>>(new Set());
  const sortedActiveDays = useRef<string[]>([]);
  activeDays.current = new Set(archiveDays.map((d) => d.day));
  sortedActiveDays.current = [...activeDays.current].sort();

  const todayKey = new Date().toISOString().slice(0, 10);
  const referenceDay = selectedDay ?? todayKey;
  const [viewYear, setViewYear] = useState(Number(referenceDay.slice(0, 4)));
  const [viewMonth, setViewMonth] = useState(Number(referenceDay.slice(5, 7)) - 1); // 0-indexed

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const years = [...new Set([...sortedActiveDays.current.map((d) => Number(d.slice(0, 4))), new Date().getFullYear()])].sort(
    (a, b) => a - b,
  );

  function changeMonth(delta: number) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) {
      m = 11;
      y--;
    } else if (m > 11) {
      m = 0;
      y++;
    }
    setViewMonth(m);
    setViewYear(y);
  }

  function jumpToAdjacentActiveDay(direction: -1 | 1) {
    const list = sortedActiveDays.current;
    if (list.length === 0) return;
    const idx = list.indexOf(referenceDay);
    let target: string | undefined;
    if (idx === -1) {
      // Not currently on an active day — find the nearest one in that direction.
      target = direction === 1 ? list.find((d) => d > referenceDay) : [...list].reverse().find((d) => d < referenceDay);
    } else {
      target = list[idx + direction];
    }
    if (!target) return;
    onSelect(target);
    setViewYear(Number(target.slice(0, 4)));
    setViewMonth(Number(target.slice(5, 7)) - 1);
    setOpen(false);
  }

  const firstOfMonth = new Date(Date.UTC(viewYear, viewMonth, 1));
  const startWeekday = firstOfMonth.getUTCDay(); // 0 = Sunday
  const daysInMonth = new Date(Date.UTC(viewYear, viewMonth + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [...Array(startWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  return (
    <div ref={containerRef} style={{ position: "relative", display: "inline-block" }}>
      <button className="btn" onClick={() => setOpen((v) => !v)}>
        {selectedDay ? `📅 ${selectedDay}` : "📅 Browse archive…"}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: "0.3rem",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: "0.6rem",
            width: 260,
            zIndex: 30,
            boxShadow: "0 12px 30px rgba(0,0,0,0.4)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.4rem" }}>
            <button className="btn" style={{ padding: "0.1rem 0.5rem" }} onClick={() => jumpToAdjacentActiveDay(-1)} title="Previous active day">
              ⏮
            </button>
            <button className="btn" style={{ padding: "0.1rem 0.5rem" }} onClick={() => changeMonth(-1)} title="Previous month">
              ‹
            </button>
            <select value={viewMonth} onChange={(e) => setViewMonth(Number(e.target.value))} style={{ fontSize: "0.8rem" }}>
              {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((m, i) => (
                <option key={m} value={i}>
                  {m}
                </option>
              ))}
            </select>
            <select value={viewYear} onChange={(e) => setViewYear(Number(e.target.value))} style={{ fontSize: "0.8rem" }}>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <button className="btn" style={{ padding: "0.1rem 0.5rem" }} onClick={() => changeMonth(1)} title="Next month">
              ›
            </button>
            <button className="btn" style={{ padding: "0.1rem 0.5rem" }} onClick={() => jumpToAdjacentActiveDay(1)} title="Next active day">
              ⏭
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px", fontSize: "0.65rem", color: "var(--text-dim)", marginBottom: "0.2rem" }}>
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <div key={i} style={{ textAlign: "center" }}>
                {d}
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px" }}>
            {cells.map((day, i) => {
              if (day === null) return <div key={i} />;
              const key = toKey(viewYear, viewMonth, day);
              const isActive = activeDays.current.has(key);
              const isToday = key === todayKey;
              const isSelected = key === selectedDay;
              return (
                <button
                  key={i}
                  disabled={!isActive}
                  onClick={() => {
                    onSelect(key);
                    setOpen(false);
                  }}
                  title={isActive ? `${key} — has messages` : key}
                  style={{
                    aspectRatio: "1",
                    fontSize: "0.75rem",
                    borderRadius: "4px",
                    border: isSelected ? "1px solid var(--text)" : "1px solid transparent",
                    background: isToday ? "var(--accent-forum)" : isActive ? "var(--accent-audio-dim)" : "transparent",
                    color: isToday ? "#0a0e1c" : isActive ? "var(--text)" : "var(--text-dim)",
                    fontWeight: isToday ? 700 : 400,
                    cursor: isActive ? "pointer" : "default",
                    opacity: isActive || isToday ? 1 : 0.35,
                  }}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
