# Voice notes in chat

A 🎙 button next to 📎 in the chat composer (the desktop dock, the phone chat page, branch chats, and the pop-out chat window) records a
voice note with the same recorder as studies (`VoiceNoteRecorder`): enhanced, levelled to the site's voice-note loudness, mono, AAC 96 kbps `.m4a`.
See `VOICE_NOTES.md` for how the note is made.

- **Preview first.** Nothing is uploaded or sent until the person presses **Send**. They can listen, record again, or discard.
- **One message.** Send uploads the note (`POST /api/attachments`) and posts one message with it. Whatever is typed in the box becomes its caption;
  files already attached go in the same message (files first, then the voice note); a reply target is kept.
- **Failure is recoverable.** If the upload is refused (storage limit, ...) the real reason is shown and the note is kept. If the upload works but the
  message fails, pressing Send again **reuses the uploaded file** instead of uploading it twice.
- **Named by time:** `voice-note-YYYYMMDD-HHMMSS.m4a` (the server adds `-2` on a collision). Chat recognises that name and shows the attachment as
  "🎙 Voice note" with a player, instead of a bare filename (`AttachmentPreview`, `lib/voiceNoteUpload.ts`).
- **Plays in place.** `.m4a` is on the list of types the server sends inline (`backend/src/lib/uploadHeaders.ts`).
- Only logged-in people see the button (the composer isn't shown otherwise).

## Not covered yet
- Private messages (`PMsPage`) have no voice notes: that is a different privacy setting from public chat and needs a decision.
- The pop-out chat window's list updates through the live connection, so the sent note appears there when the server pushes it.
- A recording dominated by one sharp spike (a clap, the browser test microphone's beep) ends up quieter than the loudness target, because the
  peak limiter holds the peak at -1 dBFS rather than distorting it. Ordinary speech reaches the target.

## Errors from uploads
`lib/api.ts`'s `ApiError` now keeps the server's whole reply (`.body`), so callers can show per-file reasons (`details`) rather than only "no attachments saved".
