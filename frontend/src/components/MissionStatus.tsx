import { timeAgo } from "../lib/relativeTime";
import type { ConversationsData } from "../lib/spaceHubs";
import { statusOf } from "../lib/traces";

function Readout({ label, value, testid }: { label: string; value: string; testid: string }) {
  return <div className="mstat-ro" data-testid={testid}><span className="mstat-label">{label}</span><span className="mstat-value">{value}</span></div>;
}

/** A compact status strip that sits beside the page title: the lamp says how busy things are, the readouts give the numbers. */
export function MissionStatus({ data, hereNow, now }: { data: ConversationsData; hereNow: number; now: number }) {
  const status = statusOf(data.totals.day, data.trace);
  return (
    <section className="mstat" aria-label="Mission status" data-testid="inst-status">
      <span className={`inst-lamp inst-lamp-${status.word.toLowerCase()}`} data-testid="inst-lamp" title={`${status.word}: the last 24 hours compared with the daily average of the 13 days before`}>
        <i aria-hidden="true" /><span className="sr-only">{status.word}</span>
      </span>
      <div className="mstat-readouts">
        <Readout testid="ro-channels" label="Channels" value={String(data.totals.conversations)} />
        <Readout testid="ro-day" label="24 h" value={data.totals.day.toLocaleString()} />
        <Readout testid="ro-week" label="Week" value={data.totals.week.toLocaleString()} />
        <Readout testid="ro-signal" label="Last signal" value={data.totals.lastSignalAt ? timeAgo(data.totals.lastSignalAt, now) : "none yet"} />
        {hereNow > 0 && <Readout testid="ro-here" label="In chat" value={String(hereNow)} />}
      </div>
    </section>
  );
}
