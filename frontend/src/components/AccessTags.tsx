import { useMemo } from "react";
import { useAuth } from "../lib/auth";
import { lockCss, viewerOf } from "../lib/access";

/** Puts a small lock on links the viewer cannot use yet. One style element, rebuilt only when the viewer's tier changes. */
export function AccessTags() {
  const { user } = useAuth();
  const css = useMemo(() => lockCss(viewerOf(user)), [user]);
  return css ? <style data-access dangerouslySetInnerHTML={{ __html: css }} /> : null;
}
