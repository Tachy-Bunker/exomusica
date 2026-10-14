import { roomHref, roomsFirst } from "./roomFirst";
/** Where a link to a branch goes: its 3D room (unless the person prefers classic pages or the device is weak), otherwise Soundbay with that branch expanded. */
export const branchHref = (slug: string): string => (roomsFirst() ? roomHref(slug) : `/soundbay?open=${encodeURIComponent(slug)}`);
