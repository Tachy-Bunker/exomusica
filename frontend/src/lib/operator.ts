// The station's operator: the one voice the site uses for its own small notices, so empty states and errors sound like the same place.
const pick = <T,>(xs: T[], seed: number): T => xs[Math.abs(seed) % xs.length];

export const operator = {
  greet: (seed = Date.now()): string => pick(["Station open. Type a name, or ? for the list.", "Listening. Say where to tune.", "On the air. Where to?"], seed),
  nothing: (q: string): string => `Nothing on that frequency for "${q}".`,
  unknown: (verb: string): string => `No such command: ${verb}. Type ? to see what the station can do.`,
  needLogin: "That one needs you signed in.",
  needAdmin: "Operators only.",
  pocketEmpty: "Your pocket is empty. Pick things up with + or take.",
  pocketFull: "Your pocket is full; the oldest thing falls out.",
  quiet: "All quiet around here.",
  tuned: (f: string): string => `Tuned to ${f}.`,
};
