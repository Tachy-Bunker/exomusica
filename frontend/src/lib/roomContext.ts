import { create } from "zustand";
/** The name of the room being read, for things a message can do that cite where it came from. Set by the room page. */
export const useRoomName = create<{ name: string; set: (n: string) => void }>((set) => ({ name: "", set: (name) => set({ name }) }));
