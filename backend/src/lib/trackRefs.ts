// Track references inside a message text: "track:42", "/t/42" or "/track/42".
// Kept in its own module so it can be tested without loading the database client.
// Deliberately independent of the frontend's eventual page-URL scheme -
// "track:ID" always works even before routing is decided.
const TRACK_REF = /(?:track:|\/t\/|\/track\/)(\d+)/g;

/** Track ids referenced in a message, in the order they appear, without repeats. */
export function trackRefIds(content: string): number[] {
  const ids: number[] = [];
  for (const match of content.matchAll(TRACK_REF)) {
    const id = Number(match[1]);
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}
