# The study editor: pictures, files, alignment, tabs, chat

Everything below is plain text in the study (so it is saved in the revision history, diffed, and exported like the rest).

## Pictures
`![description](/uploads/messages/abc.png){width=60% align=center}` on a line of its own.

- **Add** with the 🖼 Image button, by **pasting** (a screenshot, or a copied image), or by **dropping** image files on the writing box or the preview.
  A grey "Uploading image…" line shows at once and becomes the picture when the upload finishes. PNG, JPEG, WebP and GIF are pictures; anything
  else (including SVG, which can carry script) is attached as a file instead.
- **Resize** by dragging the round handle at the picture's corner in the preview, or with the left/right arrow keys on it (5%, or 1% with Shift).
  Size is written as a percentage of the page column (`width=60%`), so it fits every screen; `width=420` (no %) means pixels.
- **Align** with the ⇤ ↔ ⇥ buttons that appear on the picture (`align=center` / `align=right`; left is the default and is never written).
  `100%` makes it full width; `1:1` shows it at its own size.
- Readers see the picture at that size and can click it to open it full size.
- Pictures are files of the study: they count against the uploader's storage, and are deleted automatically when no longer used in the text.

## Alignment of text
```
:::center
These lines are centred.
:::
```
`:::left`, `:::center`, `:::right`. The ⇤ ↔ ⇥ buttons in the toolbar do this for the selected lines (or the paragraph at the cursor);
**left** removes the block. A block left open while typing still applies to the end of the text.

## Tab
- **Tab** inserts a tab (or indents every selected line); **Shift+Tab** takes one level off. **Esc, then Tab** moves focus out of the box (keyboard users are never trapped).
- In the finished text a tab at the start of a line indents that paragraph (each tab is 2 em); a tab inside a line is a visible gap.

## Files
`@file(/uploads/messages/abc.zip)` on a line of its own (an optional `[label]` is also accepted).

- Add with 📎 File, by pasting a copied file, or by dropping files. **Any type is allowed.**
- Readers get a card with the name, size and a **Download** button. **Text-based files** (txt, csv, json, source code, tex... and anything
  that really is readable UTF-8/UTF-16 text) also get a **Preview** of the first 256 KB.
- Files are *never* opened as web pages: they are sent as downloads (`/api/study-files/:id/download`), and the preview shows them as inert text.

## Security of uploads (applies to the whole site)
Everything under `/uploads/` is user-supplied and served from the site's own address. `backend/src/lib/uploadHeaders.ts` makes sure of the following:
every file is sent with `nosniff`; anything that is not plainly an image, audio, video, PDF or font is sent as a download (`attachment`) with a `sandbox`
policy; SVG keeps working as a picture but is sandboxed if opened directly. Without this, an uploaded `.html` or `.svg` file would run with the site's
privileges (including access to a visitor's login).

## The study's chat
Each study starts with its own chat. The owner can change it ("change chat" next to "discuss this study"): any existing **branch** or **topic**
chat (searched like the Location menu), a **new** dedicated chat, or **none**. The chat a study leaves keeps all its messages and stays in the forum;
nothing is ever deleted by switching, and several studies may share one chat. (`Study.channelId` is no longer unique.)
