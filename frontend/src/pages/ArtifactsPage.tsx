import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { motifLength, playMotif } from "../lib/motif";
import { getCurrentSfxVolume } from "../lib/volumeMixerStore";
import { Loading } from "../components/Loading";

interface PublicSlot { slot: number; threshold: number; revealed: boolean; title?: string; text?: string; imageUrl?: string | null; notes?: number[] }
interface ArtifactsPublic { open: boolean; scans: number; target: number; slots: PublicSlot[] }

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
const NOTE_GAP = 0.35; // seconds between the notes of one motif
const PAUSE_MS = 500; // silence between plates in "Play all"

/** Twelve Artifacts (milestone m-artifacts). Each plate is a thing the community scanned; its motif is heard on demand, never on its own. */
export function ArtifactsPage() {
  useDocumentTitle("Twelve Artifacts");
  const [data, setData] = useState<ArtifactsPublic | null>(null);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState<number | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => { api<ArtifactsPublic>("/api/artifacts").then(setData).catch(() => setFailed(true)); }, []);
  useEffect(() => () => { timers.current.forEach((t) => window.clearTimeout(t)); }, []);

  const revealed = (data?.slots ?? []).filter((s) => s.revealed && s.notes);
  const motifSeconds = Math.round(motifLength(4, NOTE_GAP) * 10) / 10;

  function hear(s: PublicSlot) { if (s.notes) playMotif(s.notes, getCurrentSfxVolume(), NOTE_GAP); }
  function stop() { timers.current.forEach((t) => window.clearTimeout(t)); timers.current = []; setPlaying(null); }
  function playAll() {
    stop();
    let at = 0;
    for (const s of revealed) {
      timers.current.push(window.setTimeout(() => { setPlaying(s.slot); if (s.notes) playMotif(s.notes, getCurrentSfxVolume(), NOTE_GAP); }, at));
      at += motifLength(s.notes!.length, NOTE_GAP) * 1000 + PAUSE_MS;
    }
    timers.current.push(window.setTimeout(() => setPlaying(null), at));
  }

  if (!data) return failed ? <p role="alert">Couldn't load the Artifacts.</p> : <Loading />;
  if (!data.open) return <section><h1>Twelve Artifacts</h1><p>These are not open yet.</p></section>;

  return (
    <section data-testid="artifacts">
      <h1>Twelve Artifacts</h1>
      <p className="home-dim">The community's scans open these one twelfth at a time. Each one is a thing that was scanned, chosen by the scans.</p>
      <p role="status" data-testid="artifacts-count">{revealed.length} of 12 open · {data.scans.toLocaleString()} scans so far</p>
      <p><button type="button" className="btn" onClick={() => (playing !== null ? stop() : playAll())} disabled={revealed.length === 0} data-testid="artifacts-play-all">
        {playing !== null ? "Stop" : `Play all (${revealed.length})`}
      </button></p>
      <ul className="artifact-grid">
        {data.slots.map((s) => (
          <li key={s.slot} data-testid={`artifact-${s.slot}`} data-revealed={s.revealed}
            className={`artifact-plate${s.revealed ? " is-revealed" : ""}${playing === s.slot ? " is-playing" : ""}`}>
            <span className="artifact-numeral">{ROMAN[s.slot - 1]}</span>
            {s.revealed ? (
              <>
                {s.imageUrl ? <img src={s.imageUrl} alt="" className="artifact-image" loading="lazy" /> : <div className="artifact-image" aria-hidden="true" />}
                <h3>{s.title}</h3>
                <p>{s.text}</p>
                <p className="home-dim artifact-motif">Motif: four notes, about {motifSeconds} s.</p>
                <button type="button" className="btn" onClick={() => hear(s)} aria-label={`Hear Artifact ${ROMAN[s.slot - 1]}: ${s.title}`}>Hear</button>
              </>
            ) : (
              <>
                <div className="artifact-image artifact-image-locked" aria-hidden="true">?</div>
                <p className="home-dim">Opens at {s.threshold.toLocaleString()} scans.</p>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
