import { useEffect, useState } from "react";

const BREAKPOINT = 900;

export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= BREAKPOINT);

  useEffect(() => {
    function handleResize() {
      setIsDesktop(window.innerWidth >= BREAKPOINT);
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return isDesktop;
}
