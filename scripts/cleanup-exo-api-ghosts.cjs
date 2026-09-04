// Run inside the backend container:
//   docker compose cp cleanup-exo-api-ghosts.js backend:/app/cleanup.js
//   docker compose exec backend node /app/cleanup.js
// Applies changes directly — prints what it did as it goes.

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  console.log("Scanning for Exo-API bot ghost accounts to reassign...\n");

  // The sanitizer that created these ghosts replaces every non
  // [a-z0-9_.-] character with "_", so "someuser | Exo-API" became
  // something like "someuser___exo-api". Match flexibly for the
  // "exo" + separators + "api" tail, case-insensitive.
  const ghosts = await prisma.user.findMany({
    where: { ghostReason: "DISCORD_IMPORT", username: { contains: "exo" } },
  });

  const suspects = ghosts.filter((g) => /exo[-_.]*api/i.test(g.username));

  if (suspects.length === 0) {
    console.log("No suspect ghost accounts found matching the Exo-API pattern.");
    await prisma.$disconnect();
    return;
  }

  for (const ghost of suspects) {
    const probableRealUsername = ghost.username.replace(/[-_.]*exo[-_.]*api.*$/i, "").replace(/[-_.]+$/, "");
    if (!probableRealUsername) {
      console.log(`Ghost "${ghost.username}" (id ${ghost.id}) — could not extract a probable real username, skipping.`);
      continue;
    }

    const realUser = await prisma.user.findFirst({
      where: { username: { equals: probableRealUsername, mode: "insensitive" }, isGhost: false },
    });

    const messageCount = await prisma.message.count({ where: { authorId: ghost.id } });

    if (!realUser) {
      console.log(`Ghost "${ghost.username}" (id ${ghost.id}, ${messageCount} messages) — guessed real username "${probableRealUsername}" but no matching real account exists. Skipping — left as-is.`);
      continue;
    }

    console.log(`Ghost "${ghost.username}" (id ${ghost.id}, ${messageCount} messages) -> reassigning to real user "${realUser.username}" (id ${realUser.id}).`);

    await prisma.message.updateMany({ where: { authorId: ghost.id }, data: { authorId: realUser.id } });
    await prisma.attachment.updateMany({ where: { uploaderId: ghost.id }, data: { uploaderId: realUser.id } });
  }

  console.log("\nDone.");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
