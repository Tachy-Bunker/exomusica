import { useState, type ReactNode } from "react";
import { useEmojiStore } from "./emojiStore";

function Spoiler({ children }: { children: ReactNode }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <span
      onClick={() => setRevealed(true)}
      style={{
        background: revealed ? "transparent" : "var(--text-dim)",
        color: revealed ? "inherit" : "transparent",
        borderRadius: 3,
        cursor: revealed ? "text" : "pointer",
        padding: "0 2px",
      }}
    >
      {children}
    </span>
  );
}

// Order matters: bold must be tried before italic since both use `*`.
const INLINE_PATTERN =
  /\*\*(.+?)\*\*|\*(.+?)\*|__(.+?)__|~~(.+?)~~|`([^`]+?)`|\|(.+?)\||\[(.+?)\]\((https?:\/\/[^\s)]+)\)|<t:(\d+)>|<@&(\d+)>|<@(\d+)>|<#(\d+)>|:([a-z0-9_]+):|(https?:\/\/[^\s<>()]+)/g;

// NOTE: mentions/channel refs render with the raw id for now — resolving
// them to real names needs a bulk id->name lookup endpoint that doesn't
// exist yet (the current /api/users/:username route is keyed the other
// way). Small, cheap follow-up; not done here.
// Same-origin URLs get a real in-app path back (no leading domain), so the
// caller can navigate() there without a full page reload. Anything else
// returns null, meaning "let the native <a target=_blank> handle it" —
// no onClick at all, so ctrl/cmd/middle-click still work exactly as a
// normal link would.
function internalPathOf(url: string): string | null {
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.origin === window.location.origin) return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    // malformed URL — treat as external, let the browser's own error handling apply
  }
  return null;
}

function renderInline(text: string, keyPrefix: string, onLinkClick?: (path: string) => void): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let i = 0;

  function linkClickHandler(url: string) {
    const internalPath = internalPathOf(url);
    if (!internalPath || !onLinkClick) return undefined; // external — no handler, native new-tab behavior applies
    return (e: React.MouseEvent) => {
      e.preventDefault();
      onLinkClick(internalPath);
    };
  }

  // matchAll (not a manual exec loop) deliberately — it doesn't mutate the
  // shared regex's lastIndex, so recursive calls for nested formatting
  // (e.g. **bold *italic***) can't corrupt the outer loop's position.
  for (const match of text.matchAll(INLINE_PATTERN)) {
    if (match.index === undefined) continue;
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const key = `${keyPrefix}-${i++}`;
    const [, bold, italic, underline, strike, code, spoiler, linkText, linkUrl, timestamp, roleId, userId, channelId, emojiName, bareUrl] =
      match;

    if (bold !== undefined) nodes.push(<strong key={key}>{renderInline(bold, key, onLinkClick)}</strong>);
    else if (italic !== undefined) nodes.push(<em key={key}>{renderInline(italic, key, onLinkClick)}</em>);
    else if (underline !== undefined) nodes.push(<u key={key}>{renderInline(underline, key, onLinkClick)}</u>);
    else if (strike !== undefined) nodes.push(<s key={key}>{renderInline(strike, key, onLinkClick)}</s>);
    else if (code !== undefined) nodes.push(<code key={key}>{code}</code>);
    else if (spoiler !== undefined) nodes.push(<Spoiler key={key}>{renderInline(spoiler, key, onLinkClick)}</Spoiler>);
    else if (linkText !== undefined && linkUrl !== undefined)
      nodes.push(
        <a key={key} href={linkUrl} target="_blank" rel="noreferrer" onClick={linkClickHandler(linkUrl)}>
          {linkText}
        </a>,
      );
    else if (timestamp !== undefined)
      nodes.push(
        <span key={key} className="mono">
          {new Date(Number(timestamp) * 1000).toLocaleString()}
        </span>,
      );
    else if (roleId !== undefined)
      nodes.push(
        <span key={key} className="mention">
          @role:{roleId}
        </span>,
      );
    else if (userId !== undefined)
      nodes.push(
        <span key={key} className="mention">
          @{userId}
        </span>,
      );
    else if (channelId !== undefined)
      nodes.push(
        <span key={key} className="mention">
          #{channelId}
        </span>,
      );
    else if (emojiName !== undefined) {
      const known = useEmojiStore.getState().emojis.find((e) => e.name === emojiName);
      nodes.push(
        known ? (
          <img key={key} className="emoji-inline" src={known.imageUrl} alt={`:${emojiName}:`} title={emojiName} />
        ) : (
          match[0]
        ),
      );
    } else if (bareUrl !== undefined)
      nodes.push(
        <a key={key} href={bareUrl} target="_blank" rel="noreferrer" onClick={linkClickHandler(bareUrl)}>
          {bareUrl}
        </a>,
      );

    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

export function renderMessageContent(text: string, onLinkClick?: (url: string) => void): ReactNode {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, idx) => {
        if (line.startsWith("## "))
          return (
            <h3 key={idx} style={{ margin: "0.3em 0", fontSize: "1.1rem" }}>
              {renderInline(line.slice(3), `h${idx}`, onLinkClick)}
            </h3>
          );
        if (line.startsWith("-# "))
          return (
            <p key={idx} style={{ fontSize: "0.75em", color: "var(--text-dim)", margin: "0.2em 0" }}>
              {renderInline(line.slice(3), `s${idx}`, onLinkClick)}
            </p>
          );
        if (line.startsWith("> "))
          return (
            <blockquote
              key={idx}
              style={{
                borderLeft: "2px solid var(--border)",
                margin: "0.2em 0",
                paddingLeft: "0.6em",
                color: "var(--text-dim)",
              }}
            >
              {renderInline(line.slice(2), `q${idx}`, onLinkClick)}
            </blockquote>
          );
        if (line.trim() === "") return <br key={idx} />;
        return (
          <p key={idx} style={{ margin: "0.2em 0" }}>
            {renderInline(line, `p${idx}`, onLinkClick)}
          </p>
        );
      })}
    </>
  );
}
