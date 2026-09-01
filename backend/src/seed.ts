import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";
import { mkdir, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { UPLOADS_DIR } from "./lib/storage.js";

const prisma = new PrismaClient();

// Every value here is overridable via env so you're not stuck with a
// documented default password in a real deployment.
const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? "admin";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@example.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "changeme123";

async function main() {
  const passwordHash = await argon2.hash(ADMIN_PASSWORD);
  const admin = await prisma.user.upsert({
    where: { username: ADMIN_USERNAME },
    create: { username: ADMIN_USERNAME, email: ADMIN_EMAIL, passwordHash, isAdmin: true },
    update: {},
  });
  console.log(`Admin account: ${ADMIN_USERNAME} (password from ADMIN_PASSWORD, or "changeme123" if unset)`);
  console.log("Log in and change it immediately if you used the default.");

  const demoUser = await prisma.user.upsert({
    where: { username: "demo_listener" },
    create: {
      username: "demo_listener",
      email: "demo_listener@example.com",
      passwordHash: await argon2.hash("changeme123"),
      bio: "Just here for the ambient stuff.",
    },
    update: {},
  });

  // --- Branch + its forum channel -------------------------------------------
  let branch = await prisma.branch.findUnique({ where: { slug: "ambient-drift" } });
  if (!branch) {
    branch = await prisma.branch.create({
      data: {
        slug: "ambient-drift",
        name: "Ambient Drift",
        description: "Slow-moving textures, tape loops, room tone. The branch this whole tree started from.",
      },
    });
    await prisma.forumChannel.create({
      data: { slug: `branch-${branch.slug}`, name: branch.name, kind: "BRANCH", branchId: branch.id },
    });
  }

  // --- One demo album with one track ----------------------------------------
  const album = await prisma.album.upsert({
    where: { slug: "half-light" },
    create: {
      branchId: branch.id,
      slug: "half-light",
      title: "Half Light",
      composer: "K. Osei",
      description: "Recorded over three nights with a single contact mic and a lot of patience.",
    },
    update: {},
  });

  let track = await prisma.track.findFirst({ where: { albumId: album.id } });
  if (!track) {
    track = await prisma.track.create({
      data: {
        albumId: album.id,
        title: "Half Light I",
        fileUrl: "https://example.com/audio/half-light-i.mp3", // REPLACE with a real hosted file — this won't play
        format: "MP3",
        durationSeconds: 312,
        position: 0,
      },
    });
  }

  let collaborator = await prisma.collaborator.findFirst({ where: { name: "K. Osei" } });
  if (!collaborator) {
    collaborator = await prisma.collaborator.create({
      data: { name: "K. Osei", role: "Composer", bio: "Works mostly in tape and field recording." },
    });
  }
  await prisma.albumCollaborator.upsert({
    where: { albumId_collaboratorId: { albumId: album.id, collaboratorId: collaborator.id } },
    create: { albumId: album.id, collaboratorId: collaborator.id },
    update: {},
  });

  const hasAboutFeature = await prisma.aboutFeature.findFirst({ where: { collaboratorId: collaborator.id } });
  if (!hasAboutFeature) {
    await prisma.aboutFeature.create({
      data: { kind: "COLLABORATOR", collaboratorId: collaborator.id, position: 0 },
    });
  }

  // --- Discussion topic with a couple of sample messages --------------------
  const discussion = await prisma.forumChannel.upsert({
    where: { slug: "art-you-like" },
    create: { slug: "art-you-like", name: "Art You Like", kind: "DISCUSSION" },
    update: {},
  });
  const hasMessages = await prisma.message.findFirst({ where: { channelId: discussion.id } });
  if (!hasMessages) {
    const now = new Date();
    const dayKey = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    await prisma.message.create({
      data: {
        channelId: discussion.id,
        authorId: admin.id,
        createdAt: now,
        dayKey,
        contentRaw: "## Welcome\nPost anything you've been looking at, listening to, or reading lately.",
      },
    });
    await prisma.message.create({
      data: {
        channelId: discussion.id,
        authorId: demoUser.id,
        createdAt: now,
        dayKey,
        contentRaw: `Been listening to the new **${album.title}** on repeat — check track:${track.id}`,
      },
    });
  }

  // --- Wiki + blog ------------------------------------------------------------
  await prisma.wikiPage.upsert({
    where: { slug: "branch-index" },
    create: {
      slug: "branch-index",
      title: "Branch Index",
      contentMarkdown: "# Branches\n\n- **Ambient Drift** — slow textures, tape loops, room tone.\n",
      updatedById: admin.id,
    },
    update: {},
  });

  await prisma.blogPost.upsert({
    where: { slug: "welcome-to-exomusica" },
    create: {
      slug: "welcome-to-exomusica",
      title: "Welcome to Exomusica",
      contentMarkdown:
        "This is the first post. Replace it from the admin panel once there's something real to announce.",
      authorId: admin.id,
      publishedAt: new Date(),
    },
    update: {},
  });

  // --- Starter font library ---------------------------------------------
  const FONTS_TO_SEED = [
    { name: "Anomaly Mono", file: "AnomalyMono-Regular.otf" },
    { name: "Cozette", file: "CozetteVector.otf" },
  ];
  const seedAssetsDir = path.join(process.cwd(), "seed-assets", "fonts");
  for (const { name, file } of FONTS_TO_SEED) {
    const existing = await prisma.customFont.findUnique({ where: { name } });
    if (existing) continue;
    const sourcePath = path.join(seedAssetsDir, file);
    if (!existsSync(sourcePath)) continue; // seed-assets not present in this build — skip quietly

    const fontsDir = path.join(UPLOADS_DIR, "fonts");
    await mkdir(fontsDir, { recursive: true });
    const ext = path.extname(file);
    const diskName = `${name.toLowerCase().replace(/\s+/g, "-")}${ext}`;
    await copyFile(sourcePath, path.join(fontsDir, diskName));

    const familyName = `exo-font-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
    await prisma.customFont.create({
      data: { name, familyName, fileUrl: `/uploads/fonts/${diskName}`, format: "opentype" },
    });
  }

  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
