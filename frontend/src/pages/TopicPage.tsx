import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useChatDockStore } from "../lib/chatDockStore";
import { useIsDesktop } from "../lib/useIsDesktop";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { ChannelPage } from "./ChannelPage";
import { renderMarkdown } from "../lib/markdown";
import { isTypingTarget } from "../lib/isTypingTarget";

interface ChannelInfo {
  slug: string;
  name: string;
  description: string | null;
  contentMarkdown: string | null;
}

export function TopicPage() {
  const { slug } = useParams<{ slug: string }>();
  const [channel, setChannel] = useState<ChannelInfo | null>(null);
  const isDesktop = useIsDesktop();
  const openChat = useChatDockStore((s) => s.openChat);
  const closeChat = useChatDockStore((s) => s.close);
  const dockOpenChannelSlug = useChatDockStore((s) => s.openChannelSlug);

  useEffect(() => {
    if (!isDesktop) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (e.code === "KeyE") {
        if (dockOpenChannelSlug) closeChat();
        else if (channel) openChat(channel.slug, channel.name);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDesktop, dockOpenChannelSlug, closeChat, openChat, channel]);


  useEffect(() => {
    if (!slug) return;
    api<ChannelInfo>(`/api/channels/${slug}`).then(setChannel);
  }, [slug]);

  useDocumentTitle(channel?.name ?? "");

  useEffect(() => {
    if (isDesktop && channel) {
      // No branch slug — this is a standalone forum topic, not tied to a branch.
      openChat(channel.slug, channel.name);
    }
  }, [isDesktop, channel, openChat]);

  if (!channel) return <p>Loading…</p>;

  if (isDesktop) {
    return (
      <div>
        <h1>
          {channel.name} <span style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>(E)</span>
        </h1>
        {channel.description && <p style={{ color: "var(--text-dim)", maxWidth: 640 }}>{channel.description}</p>}
        {channel.contentMarkdown && <div style={{ maxWidth: 640 }}>{renderMarkdown(channel.contentMarkdown)}</div>}
      </div>
    );
  }

  return <ChannelPage channelSlug={channel.slug} />;
}
