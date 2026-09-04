import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "../lib/api";
import { useChatDockStore } from "../lib/chatDockStore";
import { useIsDesktop } from "../lib/useIsDesktop";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { ChannelPage } from "./ChannelPage";
import { renderMarkdown } from "../lib/markdown";
import { isTypingTarget } from "../lib/isTypingTarget";
import { underlineLetter } from "../lib/underlineLetter";

interface ChannelInfo {
  slug: string;
  name: string;
  description: string | null;
  contentMarkdown: string | null;
}

export function TopicPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [channel, setChannel] = useState<ChannelInfo | null>(null);
  const isDesktop = useIsDesktop();
  const openChat = useChatDockStore((s) => s.openChat);
  const dockOpenChannelSlug = useChatDockStore((s) => s.openChannelSlug);
  const toggleDockCollapse = useChatDockStore((s) => s.toggleCollapse);

  useEffect(() => {
    if (!isDesktop) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (e.code === "KeyE") {
        if (dockOpenChannelSlug === channel?.slug) toggleDockCollapse();
        else if (channel) openChat(channel.slug, channel.name);
      }
      if (e.code === "KeyR") navigate("/discussion");
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDesktop, dockOpenChannelSlug, toggleDockCollapse, openChat, channel, navigate]);


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
        <p style={{ marginBottom: "0.5rem" }}>
          <Link to="/discussion">← Return to {underlineLetter("Forums", "r")}</Link>{" "}
          <span style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>(R)</span>
        </p>
        <h1>
          {channel.name} <span style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>(E)</span>
        </h1>
        {channel.description && <p style={{ color: "var(--text-dim)", maxWidth: 640 }}>{channel.description}</p>}
        {channel.contentMarkdown && <div style={{ maxWidth: 640 }}>{renderMarkdown(channel.contentMarkdown, navigate)}</div>}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100dvh - var(--nav-height, 3.6rem) - 3rem)" }}>
      <p style={{ marginBottom: "0.4rem", flexShrink: 0 }}>
        <Link to="/discussion">← Return to Forums</Link>
      </p>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ChannelPage channelSlug={channel.slug} />
      </div>
    </div>
  );
}
