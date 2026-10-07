import { useCallback, type MouseEvent } from "react";
import { useChatDockStore } from "./chatDockStore";
import { opensInDockFirst } from "./scopeChoice";
import { useIsDesktop } from "./useIsDesktop";

/** For a link to a chat: the first click opens it in the dock, a second click (once it is there) goes to its page. */
export function useOpenInDock() {
  const desktop = useIsDesktop();
  const openSlug = useChatDockStore((s) => s.openChannelSlug);
  const openChat = useChatDockStore((s) => s.openChat);
  return useCallback((e: MouseEvent, chat: { slug: string; name: string; branchSlug?: string | null }) => {
    if (e.defaultPrevented) return;
    if (!opensInDockFirst({ desktop, openSlug, slug: chat.slug, button: e.button, modifier: e.metaKey || e.ctrlKey || e.shiftKey || e.altKey })) return;
    e.preventDefault();
    openChat(chat.slug, chat.name, chat.branchSlug ?? undefined);
  }, [desktop, openSlug, openChat]);
}
