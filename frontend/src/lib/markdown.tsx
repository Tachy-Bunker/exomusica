import type { ReactNode } from "react";

function internalPathOf(url: string): string | null {
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.origin === window.location.origin) return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    // malformed URL - treat as external, let the browser's own error handling apply
  }
  return null;
}

/**
 * Options for the richer dialect used by studies. Everything here is
 * opt-in: with no options the output is exactly what it always was, so
 * forum posts, wiki pages and news render unchanged.
 */
export interface MarkdownOptions {
  /** Adds inline `code`, fenced code blocks, > quotes, 1. lists and --- rules. */
  extended?: boolean;
  /** Note texts, so [n] renders as a superscript link to note n. */
  notes?: string[];
}

const BASE_INLINE = /\*\*(.+?)\*\*|\*(.+?)\*|\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g;
// code first, so asterisks and brackets inside `code` stay literal; [n] last,
// so [1](https://...) is still a link.
const EXTENDED_INLINE = /`([^`\n]+)`|\*\*(.+?)\*\*|\*(.+?)\*|\[(.+?)\]\((https?:\/\/[^\s)]+)\)|\[(\d+)\]/g;

function renderInline(text: string, onLinkClick?: (path: string) => void, options?: MarkdownOptions): ReactNode[] {
  const ext = !!options?.extended;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let i = 0;
  for (const match of text.matchAll(ext ? EXTENDED_INLINE : BASE_INLINE)) {
    if (match.index === undefined) continue;
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    let code: string | undefined;
    let bold: string | undefined;
    let italic: string | undefined;
    let linkText: string | undefined;
    let linkUrl: string | undefined;
    let noteNumber: string | undefined;
    if (ext) [, code, bold, italic, linkText, linkUrl, noteNumber] = match;
    else [, bold, italic, linkText, linkUrl] = match;
    const key = `i-${i++}`;
    if (code !== undefined) nodes.push(<code key={key}>{code}</code>);
    else if (bold !== undefined) nodes.push(<strong key={key}>{bold}</strong>);
    else if (italic !== undefined) nodes.push(<em key={key}>{italic}</em>);
    else if (noteNumber !== undefined) {
      const n = Number(noteNumber);
      const noteText = options?.notes?.[n - 1];
      if (noteText === undefined) nodes.push(match[0]); // [7] with no 7th note is just text
      else
        nodes.push(
          <sup key={key} className="footnote-ref">
            <a
              href={`#note-${n}`}
              title={noteText}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(`note-${n}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
            >
              [{n}]
            </a>
          </sup>,
        );
    } else if (linkText !== undefined) {
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

// Embeds are block-level - each must be alone on its own line. Images use
// standard markdown syntax; audio/video/generic-file have no standard
// markdown equivalent, so they get simple custom tags instead.
const IMAGE_LINE = /^!\[(.*?)\]\((\S+)\)$/;
const AUDIO_LINE = /^@audio\((\S+)\)$/;
const VIDEO_LINE = /^@video\((\S+)\)$/;
const FILE_LINE = /^@file\((\S+)\)(?:\[(.*?)\])?$/;
const ORDERED_LINE = /^\d+[.)]\s(.*)$/;
const RULE_LINE = /^(-{3,}|\*{3,})$/;

export function renderMarkdown(markdown: string, onLinkClick?: (path: string) => void, options?: MarkdownOptions): ReactNode {
  const ext = !!options?.extended;
  const lines = markdown.split("\n");
  const blocks: ReactNode[] = [];
  let listBuffer: string[] = [];
  let orderedBuffer: string[] = [];
  let quoteBuffer: string[] = [];
  let fenceBuffer: string[] | null = null;
  let key = 0;

  function flushList() {
    if (listBuffer.length > 0) {
      blocks.push(
        <ul key={`ul-${key++}`}>
          {listBuffer.map((item, i) => (
            <li key={i}>{renderInline(item, onLinkClick, options)}</li>
          ))}
        </ul>,
      );
      listBuffer = [];
    }
    if (orderedBuffer.length > 0) {
      blocks.push(
        <ol key={`ol-${key++}`}>
          {orderedBuffer.map((item, i) => (
            <li key={i}>{renderInline(item, onLinkClick, options)}</li>
          ))}
        </ol>,
      );
      orderedBuffer = [];
    }
    if (quoteBuffer.length > 0) {
      blocks.push(
        <blockquote key={`bq-${key++}`}>
          {quoteBuffer.map((item, i) => (
            <p key={i}>{renderInline(item, onLinkClick, options)}</p>
          ))}
        </blockquote>,
      );
      quoteBuffer = [];
    }
  }

  function flushFence() {
    if (fenceBuffer === null) return;
    blocks.push(
      <pre key={`pre-${key++}`}>
        <code>{fenceBuffer.join("\n")}</code>
      </pre>,
    );
    fenceBuffer = null;
  }

  for (const line of lines) {
    if (ext) {
      // Inside a fenced block everything is literal until the closing fence.
      if (fenceBuffer !== null) {
        if (line.startsWith("```")) flushFence();
        else fenceBuffer.push(line);
        continue;
      }
      if (line.startsWith("```")) {
        flushList();
        fenceBuffer = [];
        continue;
      }
    }

    const image = line.match(IMAGE_LINE);
    const audio = line.match(AUDIO_LINE);
    const video = line.match(VIDEO_LINE);
    const file = line.match(FILE_LINE);
    const ordered = ext ? line.match(ORDERED_LINE) : null;

    if (line.startsWith("# ")) {
      flushList();
      blocks.push(<h1 key={key++}>{renderInline(line.slice(2), onLinkClick, options)}</h1>);
    } else if (line.startsWith("## ")) {
      flushList();
      blocks.push(<h2 key={key++}>{renderInline(line.slice(3), onLinkClick, options)}</h2>);
    } else if (line.startsWith("### ")) {
      flushList();
      blocks.push(<h3 key={key++}>{renderInline(line.slice(4), onLinkClick, options)}</h3>);
    } else if (line.startsWith("- ")) {
      if (ext && (orderedBuffer.length > 0 || quoteBuffer.length > 0)) flushList();
      listBuffer.push(line.slice(2));
    } else if (ordered) {
      if (listBuffer.length > 0 || quoteBuffer.length > 0) flushList();
      orderedBuffer.push(ordered[1]);
    } else if (ext && line.startsWith("> ")) {
      if (listBuffer.length > 0 || orderedBuffer.length > 0) flushList();
      quoteBuffer.push(line.slice(2));
    } else if (ext && RULE_LINE.test(line)) {
      flushList();
      blocks.push(<hr key={key++} />);
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
      blocks.push(<p key={key++}>{renderInline(line, onLinkClick, options)}</p>);
    }
  }
  flushList();
  flushFence(); // an unclosed fence still shows as code, which is what you want mid-typing
  return <>{blocks}</>;
}

/** Inline-only rendering (bold, italic, code, links) for short texts like study notes. */
export function renderInlineMarkdown(text: string, onLinkClick?: (path: string) => void): ReactNode {
  return <>{renderInline(text, onLinkClick, { extended: true })}</>;
}
