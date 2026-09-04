import type { ReactNode } from "react";

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

function renderInline(text: string, onLinkClick?: (path: string) => void): ReactNode[] {
  const pattern = /\*\*(.+?)\*\*|\*(.+?)\*|\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let i = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index === undefined) continue;
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const [, bold, italic, linkText, linkUrl] = match;
    const key = `i-${i++}`;
    if (bold !== undefined) nodes.push(<strong key={key}>{bold}</strong>);
    else if (italic !== undefined) nodes.push(<em key={key}>{italic}</em>);
    else if (linkText !== undefined) {
      const internalPath = linkUrl ? internalPathOf(linkUrl) : null;
      const clickHandler =
        internalPath && onLinkClick
          ? (e: React.MouseEvent) => {
              e.preventDefault();
              onLinkClick(internalPath);
            }
          : undefined;
      nodes.push(
        <a key={key} href={linkUrl} target="_blank" rel="noreferrer" onClick={clickHandler}>
          {linkText}
        </a>,
      );
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

// Embeds are block-level — each must be alone on its own line. Images use
// standard markdown syntax; audio/video/generic-file have no standard
// markdown equivalent, so they get simple custom tags instead.
const IMAGE_LINE = /^!\[(.*?)\]\((\S+)\)$/;
const AUDIO_LINE = /^@audio\((\S+)\)$/;
const VIDEO_LINE = /^@video\((\S+)\)$/;
const FILE_LINE = /^@file\((\S+)\)(?:\[(.*?)\])?$/;

export function renderMarkdown(markdown: string, onLinkClick?: (path: string) => void): ReactNode {
  const lines = markdown.split("\n");
  const blocks: ReactNode[] = [];
  let listBuffer: string[] = [];
  let key = 0;

  function flushList() {
    if (listBuffer.length === 0) return;
    blocks.push(
      <ul key={`ul-${key++}`}>
        {listBuffer.map((item, i) => (
          <li key={i}>{renderInline(item, onLinkClick)}</li>
        ))}
      </ul>,
    );
    listBuffer = [];
  }

  for (const line of lines) {
    const image = line.match(IMAGE_LINE);
    const audio = line.match(AUDIO_LINE);
    const video = line.match(VIDEO_LINE);
    const file = line.match(FILE_LINE);

    if (line.startsWith("# ")) {
      flushList();
      blocks.push(<h1 key={key++}>{renderInline(line.slice(2), onLinkClick)}</h1>);
    } else if (line.startsWith("## ")) {
      flushList();
      blocks.push(<h2 key={key++}>{renderInline(line.slice(3), onLinkClick)}</h2>);
    } else if (line.startsWith("### ")) {
      flushList();
      blocks.push(<h3 key={key++}>{renderInline(line.slice(4), onLinkClick)}</h3>);
    } else if (line.startsWith("- ")) {
      listBuffer.push(line.slice(2));
    } else if (image) {
      flushList();
      blocks.push(<img key={key++} src={image[2]} alt={image[1]} style={{ maxWidth: "100%", borderRadius: "var(--radius)" }} />);
    } else if (audio) {
      flushList();
      blocks.push(<audio key={key++} controls src={audio[1]} style={{ display: "block", maxWidth: 400 }} />);
    } else if (video) {
      flushList();
      blocks.push(<video key={key++} controls src={video[1]} style={{ display: "block", maxWidth: 480, borderRadius: "var(--radius)" }} />);
    } else if (file) {
      flushList();
      const [, url, label] = file;
      blocks.push(
        <a key={key++} className="btn" href={url} target="_blank" rel="noreferrer" style={{ display: "inline-block", textDecoration: "none" }}>
          📎 {label || url}
        </a>,
      );
    } else if (line.trim() === "") {
      flushList();
    } else {
      flushList();
      blocks.push(<p key={key++}>{renderInline(line, onLinkClick)}</p>);
    }
  }
  flushList();
  return <>{blocks}</>;
}
