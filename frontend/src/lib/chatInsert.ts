/** Things carried across the page into a chat's composer: a pocket item dragged in, or the "send to chat" button. */
export const CHAT_INSERT = "exomusica:chat-insert";
export const LINK_MIME = "application/x-exomusica-link";

const abs = (href: string): string => (/^https?:\/\//i.test(href) ? href : `${window.location.origin}${href.startsWith("/") ? "" : "/"}${href}`);
/** A markdown link, the form the composer already understands. */
export function chatLinkText(title: string, href: string): string {
  const t = title.replace(/[\[\]\r\n]+/g, " ").trim() || "link";
  return `[${t}](${abs(href)})`;
}
/** Put this text at the cursor of the chat composer that is on screen. Returns false when there is none. */
export function insertIntoChat(text: string): boolean {
  const detail = { text, handled: false };
  window.dispatchEvent(new CustomEvent(CHAT_INSERT, { detail }));
  return detail.handled;
}
export const hasComposer = (): boolean => typeof document !== "undefined" && !!document.querySelector("textarea.hud-reveal-textarea");
/** Splice `text` into `value` at the selection, with a space around it when it would touch other words. */
export function spliceAt(value: string, start: number, end: number, text: string): { value: string; cursor: number } {
  const before = value.slice(0, start), after = value.slice(end);
  const pre = before && !/\s$/.test(before) ? " " : "";
  const post = after && !/^\s/.test(after) ? " " : after ? "" : " ";
  const inserted = pre + text + post;
  return { value: before + inserted + after, cursor: before.length + inserted.length };
}
export function dragPayload(e: { dataTransfer: DataTransfer }, title: string, href: string): void {
  const text = chatLinkText(title, href);
  e.dataTransfer.setData(LINK_MIME, text);
  e.dataTransfer.setData("text/plain", text);
  e.dataTransfer.effectAllowed = "copyLink";
}
