import { useEffect } from "react";

let users = 0;
/** A page that flies with the W A S D keys (by physical key, so Z Q S D on an AZERTY keyboard) calls this: plain letter shortcuts such as Q stand down meanwhile. */
export function useWasdKeys(): void {
  useEffect(() => {
    users++; document.documentElement.setAttribute("data-wasd", "1");
    return () => { users--; if (users <= 0) { users = 0; document.documentElement.removeAttribute("data-wasd"); } };
  }, []);
}
export const wasdActive = (): boolean => document.documentElement.hasAttribute("data-wasd");
