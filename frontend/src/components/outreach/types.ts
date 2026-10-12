export const COL_TYPES = ["text", "longtext", "number", "date", "checkbox", "select", "multiselect", "url", "email", "rating"] as const;
export type ColType = (typeof COL_TYPES)[number];
export const COL_TYPE_LABEL: Record<ColType, string> = {
  text: "Text", longtext: "Long text", number: "Number", date: "Date", checkbox: "Checkbox", select: "Choice", multiselect: "Several choices", url: "Link", email: "Email", rating: "Rating (1–5)",
};
export interface Col { id: number; key: string; name: string; type: ColType; options: string[]; hidden: boolean; width: number | null }
export type CellValue = string | number | boolean | string[] | null | undefined;
export interface Contact { id: number; name: string; email: string; data: Record<string, CellValue>; lastSentAt: string | null; sentCount: number; followUpAt: string | null }
export interface OutreachSettings {
  smtpHost: string; smtpPort: number; smtpSecure: boolean; smtpUser: string; hasPassword: boolean;
  fromName: string; fromEmail: string; replyTo: string; defaultCc: string; defaultBcc: string;
  imapHost: string; imapPort: number; imapSecure: boolean; sentFolder: string; fileInSent: boolean; signatureMd: string; followUpDays: number;
}
export interface Block { id: number; typeId: number; title: string; body: string }
export interface BlockType { id: number; name: string; blocks: Block[] }
export interface OutreachState { settings: OutreachSettings; columns: Col[]; contacts: Contact[]; blockTypes: BlockType[]; today: string }
export interface SendResult { results: { to: string; ok: boolean; error?: string; filedInSent?: boolean }[]; sent: number; failed: number; skipped: string[]; followUpAt: string | null; defaultFollowUp: string }
export interface HistoryRow { id: number; contactId: number | null; to: string; subject: string; sentAt: string; ok: boolean; note: string | null; filedInSent: boolean }
