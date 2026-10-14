/** True only while the door replays a held link click, so listeners that react to every click (the link sound) skip the copy. */
let replaying = false;
export const isDoorReplay = (): boolean => replaying;
export const setDoorReplay = (v: boolean): void => { replaying = v; };
