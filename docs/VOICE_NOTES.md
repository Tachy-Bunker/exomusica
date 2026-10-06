# Voice notes

A voice note is a recording that has been enhanced, levelled to the loudness of the songs, made mono, given a short fade-out,
and saved as AAC 96 kbps (`.m4a`). **There is no limit on length.**

## The steps (`frontend/src/lib/dsp/voiceNoteStream.ts`)

1. **Capture.** `worklets/capture.worklet.ts` copies the microphone (a stereo mic is folded to mono) and sends it, over a direct
   channel, to `workers/voiceNote.worker.ts`, which writes it to the browser's private file store as 16-bit audio. Nothing
   accumulates in memory.
2. **Enhance.** The recording, followed by 2 s of silence (so the reverb can ring out), goes through the **Enhancer** chain
   (original Airwindows code compiled to WebAssembly, see `frontend/wasm/airwindows`). The two channels are averaged to mono and the result
   is parked on disk.
3. **Measure.** DC offset removed, the 2 s tail faded to exactly zero (raised cosine), then the loudness is measured
   (ITU-R BS.1770 integrated, gated).
4. **Level.** Gain brings it to **-14 LUFS as heard on stereo speakers** (a mono note counts +3 dB, being two identical
   channels). Boost is capped at 24 dB, like the songs. A short-lookahead limiter holds peaks at -1 dBFS; since it lowers loudness a
   little, trial passes find the gain that lands the finished note on target.
5. **Encode.** AAC 96 kbps mono, written as it is produced.

Every step works on a piece at a time, so memory use is flat however long the note is. Cancelling at any point deletes the
temporary files. Files left by a crashed tab are removed the next time the worker starts.

## Constants (`lib/dsp/voiceNote.ts`)

| | |
|-|-|
| `VOICE_NOTE_TARGET_LUFS` | -14. The songs are levelled to -18 dBFS RMS per channel (`lib/replayGain.ts`), about -15 LUFS for typical music as a stereo file; -14 is deliberately one unit above. |
| `TAIL_SECONDS` | 2 |
| `PEAK_CEILING_DB` | -1 |
| `MAX_GAIN_DB` | 24 |

## Limits that remain

- **The site's per-file upload limit (100 MB)** is about 2.3 hours of voice at 96 kbps (0.72 MB a minute). The recorder shows a size estimate and warns near the limit; a longer note can still be recorded and downloaded.
- **Time.** Processing runs at roughly 8x real time including encoding on a desktop (a 30-minute note takes about 4 minutes); slower devices take longer. There is a progress bar and a Cancel button.
- **Browsers without the file store** (very old ones) fall back to memory, which limits how long a note can be there.

## Tests

The in-memory renderer (`renderVoiceNote`) is kept as the reference: the streaming pipeline produces the same samples as it,
bit for bit, for any chunk size, and the streaming limiter is bit-identical to the original whole-array limiter. The finished
files are checked with ffprobe and ffmpeg's own EBU R128 meter.
