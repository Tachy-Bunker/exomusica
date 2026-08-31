import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

/** Converts a real account into a ghost: messages stay attributed to the
 *  same User row, but the account can no longer log in and its private
 *  fields are cleared. Never deletes the row. */
export async function ghostifyUser(userId: number) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      isGhost: true,
      ghostReason: "ACCOUNT_DELETED",
      deletedAt: new Date(),
      email: null,
      passwordHash: null,
      bio: null,
      links: Prisma.DbNull,
      claimToken: null,
      // avatarUrl is deliberately left as-is: it's already public, and
      // clearing it would just make old messages look emptier for no
      // privacy gain. Revisit if that's not the call you want.
    },
  });
}
