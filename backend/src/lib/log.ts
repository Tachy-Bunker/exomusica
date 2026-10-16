// One line per message: time, level, then the text. Info goes to stdout; warnings and errors go to stderr, so the container
// log keeps the same split. Errors print their stack; objects print as JSON when they can.
type Level = "INFO" | "WARN" | "ERROR";

function text(v: unknown): string {
  if (v instanceof Error) return v.stack ?? v.message;
  if (typeof v === "string") return v;
  try { return JSON.stringify(v) ?? String(v); } catch { return String(v); }
}

function line(level: Level, args: unknown[]): string {
  return `${new Date().toISOString()} ${level} ${args.map(text).join(" ")}\n`;
}

export const log = {
  info: (...args: unknown[]): void => { process.stdout.write(line("INFO", args)); },
  warn: (...args: unknown[]): void => { process.stderr.write(line("WARN", args)); },
  error: (...args: unknown[]): void => { process.stderr.write(line("ERROR", args)); },
};
