import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * A page's filters, search and sort live in its address, so a view can be linked and the back button works.
 * Each change is built from the address as it is RIGHT NOW, never from what the page last drew: two quick changes
 * (clear the search, then pick a sort) must not undo each other.
 */
export function useUrlParams() {
  const [params, setParams] = useSearchParams();
  const set = useCallback(
    (key: string, value: string, fallback: string) => {
      const next = new URLSearchParams(window.location.search);
      if (!value || value === fallback) next.delete(key);
      else next.set(key, value);
      setParams(next, { replace: true });
    },
    [setParams],
  );
  return [params, set] as const;
}
