export const COL_TYPES = ["text", "longtext", "number", "date", "checkbox", "select", "multiselect", "url", "email", "rating"] as const;
export type ColType = (typeof COL_TYPES)[number];
export const COL_TYPE_LABEL: Record<ColType, string> = {
  text: "Text", longtext: "Long text", number: "Number", date: "Date", checkbox: "Checkbox", select: "Choice", multiselect: "Several choices", url: "Link", email: "Email", rating: "Rating (1–5)",
};
export interface Col { id: number; key: string; name: string; type: ColType; options: string[]; hidden: boolean; width: number | null }
export type CellValue = string | number | boolean | string[] | null | undefined;
export interface Contact { id: number; name: string; email: string; data: Record<string, CellValue>; lastSentAt: string | null; sentCount: number; followUpAt: string | null; groups: number[]; status: string; deadline: string | null; repliedAt: string | null; timezone: string; place: string; lat: number | null; lng: number | null; source: string; doNotContact: boolean; snoozeReason: string; declineReason: string; reopensAt: string | null }
export interface Group { id: number; name: string }
export interface OutreachSettings {
  id: number; label: string; isDefault: boolean;
  smtpHost: string; smtpPort: number; smtpSecure: boolean; smtpUser: string; hasPassword: boolean;
  fromName: string; fromEmail: string; replyTo: string; defaultCc: string; defaultBcc: string;
  imapHost: string; imapPort: number; imapSecure: boolean; sentFolder: string; fileInSent: boolean; signatureMd: string; followUpDays: number;
  inboxOn: boolean; inboxFolder: string; inboxCheckedAt: string | null; inboxError: string | null;
}
export interface Block { id: number; typeId: number; title: string; body: string }
export interface BlockType { id: number; name: string; blocks: Block[] }
export interface Rule { kind: string; group: number | null; blockId: number }
export interface Template { id: number; name: string; subject: string; bodyMd: string; rules: Rule[] }
export interface Scheduled { id: number; to: string; contactId: number | null; subject: string; sendAt: string; status: "pending" | "sending" | "sent" | "failed" | "cancelled"; error: string | null }
export interface StatRow { name: string; people: number; replied: number; accepted: number; rate: number }
export interface FitProfile { keywords: string[]; avoid: string[]; regions: string[]; maxFee: number | null; yearlyBudget: number | null; home: string; homeLat: number | null; homeLng: number | null }
export interface AttachRule { group: number; fileId: number }
export interface WorkspaceInfo { id: number; name: string; slug: string; trackLinks: boolean; dnc: string[]; profile: Partial<FitProfile>; attachRules: AttachRule[]; digestOn: boolean; trackAvailable?: boolean }
export interface FileItem { id: number; groupId: number | null; name: string; url: string; mimeType: string; sizeBytes: number; kind: "image" | "audio" | "file"; createdAt: string }
export interface FormField { label: string; type: string; required: boolean; options: string[]; help?: string }
export interface FormInfo { kind: "google" | "html" | "unknown"; title: string; description: string; fields: FormField[] }
export interface Lead { id: number; title: string; url: string; summary: string; deadline: string | null; fee: string | null; place: string; emails: string[]; fields: FormField[]; source: string; status: string; foundAt: string }
export interface Feed { id: number; url: string; title: string; active: boolean; lastCheckedAt: string | null; error: string | null }
export interface MsgRow { key: string; direction: "in" | "out"; who: string; subject: string; date: string; snippet: string; kind: "application" | "stray"; hint: string | null; contactId: number | null; imported: boolean }
export interface MsgFull { key: string; direction: "in" | "out"; from: string; to: string; subject: string; date: string; body: string; kind: "application" | "stray"; reason: string; hint: string | null; contactId: number | null; attachments: { name: string; size: number }[] }
export interface ImportReport { files: number; imported: number; duplicates: number; strays: number; newContacts: number; updatedContacts: number; failed: { name: string; error: string }[]; suggestions: { contactId: number; who: string; hint: string; subject: string }[] }
export interface Stats { statuses: Record<string, number>; groups: StatRow[]; templates: StatRow[]; blocks: StatRow[]; weekdays: { sent: number; replied: number }[]; overall: StatRow; variants?: StatRow[]; hours?: { hour: number; sent: number; replied: number }[]; bestHours?: number[]; answers?: { name: string; n: number; median: number }[]; answerDays?: { n: number; median: number }; quietAfter?: number; reasons?: { reason: string; n: number }[]; totalSends?: number }
export interface Opportunity { title: string; emails: string[]; deadline: string | null; fee: string | null; url: string | null; place?: string; lat?: number | null; lng?: number | null; form?: FormInfo | null; existing?: { id: number; name: string; email: string }[]; blocked?: boolean }
export interface OutreachState { templates: Template[]; scheduled: Scheduled[]; groups: Group[]; accounts: OutreachSettings[]; workspace: WorkspaceInfo; newLeads: number; quietAfter: number; columns: Col[]; contacts: Contact[]; blockTypes: BlockType[]; today: string }
export interface SendResult { scheduled?: number; firstAt?: string; results: { to: string; ok: boolean; error?: string; filedInSent?: boolean }[]; sent: number; failed: number; skipped: string[]; followUpAt: string | null; defaultFollowUp: string }
export interface HistoryRow { id: number; contactId: number | null; to: string; subject: string; sentAt: string; ok: boolean; note: string | null; filedInSent: boolean }

export const STATUS_ORDER = ["lead", "contacted", "replied", "accepted", "declined", "ghosted"] as const;
export const STATUS_LABEL: Record<string, string> = { "": "—", lead: "Lead", contacted: "Contacted", replied: "Replied", accepted: "Accepted", declined: "Declined", ghosted: "No answer" };
