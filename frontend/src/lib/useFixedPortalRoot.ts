import { useEffect, useState } from "react";

export function useFixedPortalRoot(): HTMLElement | null {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setRoot(document.getElementById("fixed-portal-root"));
  }, []);
  return root;
}
