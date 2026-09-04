// Run inside the backend container after deploying the schema migration:
//   docker compose cp scripts/migrate-collaborator-links.cjs backend:/app/migrate-links.js
//   docker compose exec backend node /app/migrate-links.js
// Reads each collaborator's old legacyLinksJson blob and creates proper
// CollaboratorLink rows from it. Safe to re-run — skips any collaborator
// that already has rows in the new table.

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  console.log("Migrating legacy collaborator links...\n");

  const collaborators = await prisma.collaborator.findMany({
    where: { legacyLinksJson: { not: null } },
    include: { links: true },
  });

  let migrated = 0;
  let skipped = 0;

  for (const c of collaborators) {
    if (c.links.length > 0) {
      skipped++;
      continue;
    }
    const raw = c.legacyLinksJson;
    if (!Array.isArray(raw)) continue;

    let position = 0;
    for (const entry of raw) {
      const label = entry?.label ?? entry?.name;
      const url = entry?.url;
      if (!label || !url) continue;
      await prisma.collaboratorLink.create({
        data: { collaboratorId: c.id, label: String(label), url: String(url), position: position++ },
      });
    }
    console.log(`  ${c.name}: migrated ${position} link(s)`);
    migrated++;
  }

  console.log(`\nDone. ${migrated} collaborator(s) migrated, ${skipped} already had links and were skipped.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
