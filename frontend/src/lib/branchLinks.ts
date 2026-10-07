/** Where a link to a branch goes now: Soundbay, with that branch expanded (its information, albums and discussion all live there). */
export const branchHref = (slug: string): string => `/soundbay?open=${encodeURIComponent(slug)}`;
