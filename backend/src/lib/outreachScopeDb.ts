import { prisma } from "./prisma.js";

/** Models that belong to one workspace. OutreachBlock has no column of its own: it is scoped through its type. */
const SCOPED = new Set(["OutreachColumn", "OutreachContact", "OutreachGroup", "OutreachSend", "OutreachBlockType", "OutreachTemplate", "OutreachScheduled", "OutreachAccount", "OutreachFileGroup", "OutreachFile", "OutreachMessage", "OutreachFeed", "OutreachLead", "OutreachLink"]);
const WHERE_OPS = new Set(["findFirst", "findFirstOrThrow", "findMany", "count", "aggregate", "groupBy", "updateMany", "deleteMany", "findUnique", "findUniqueOrThrow", "update", "delete"]);

/** A Prisma client that can only see (and can only write into) one workspace. Every Outreach route works through it, so a
 *  forgotten `where` can't leak another artist's contacts. */
export function scopedDb(workspaceId: number) {
  return prisma.$extends({
    name: "outreach-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }: { model: string; operation: string; args: unknown; query: (a: never) => Promise<unknown> }) {
          const a = (args ?? {}) as Record<string, unknown>;
          if (model === "OutreachBlock") {
            if (WHERE_OPS.has(operation)) a.where = { ...(a.where as object), type: { workspaceId } };
            return query(a as never);
          }
          if (!SCOPED.has(model)) return query(args as never);
          if (WHERE_OPS.has(operation)) a.where = { ...(a.where as object), workspaceId };
          else if (operation === "create") a.data = { ...(a.data as object), workspaceId };
          else if (operation === "createMany") { const d = a.data as object | object[]; a.data = Array.isArray(d) ? d.map((x) => ({ ...x, workspaceId })) : { ...d, workspaceId }; }
          else if (operation === "upsert") { a.where = { ...(a.where as object), workspaceId }; a.create = { ...(a.create as object), workspaceId }; }
          return query(a as never);
        },
      },
    },
  });
}
export type ScopedDb = ReturnType<typeof scopedDb>;

