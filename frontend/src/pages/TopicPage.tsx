import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useChatDockStore } from "../lib/chatDockStore";
import { useIsDesktop } from "../lib/useIsDesktop";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { ChannelPage } from "./ChannelPage";

interface ChannelInfo {
  slug: string;
  name: string;
  description: string | null;
}

export function TopicPage() {
  const { slug } = useParams<{ slug: string }>();
  const [channel, setChannel] = useState<ChannelInfo | null>(null);
  const isDesktop = useIsDesktop();
  const openChat = useChatDockStore((s) => s.openChat);

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
        <h1>{channel.name}</h1>
        {channel.description && <p style={{ color: "var(--text-dim)", maxWidth: 640 }}>{channel.description}</p>}
        <p style={{ color: "var(--text-dim)", fontSize: "0.9rem" }}>This topic's chat is open in the dock →</p>
      </div>
    );
  }

  return <ChannelPage channelSlug={channel.slug} />;
}
