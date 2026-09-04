// Run inside the backend container AFTER deploying the build that includes
// probeAudioDuration (dist/lib/audioProbe.js must exist):
//   docker compose cp backfill-track-durations.js backend:/app/backfill.js
//   docker compose exec backend node /app/backfill.js
//
// Fetches each track missing a duration and probes it from the file's own
// embedded metadata. This downloads the full file for each track once —
// expect it to take a while and use real bandwidth if you have many
// tracks, but it only needs to run once.

import { PrismaClient } from "@prisma/client";
import { probeAudioDuration } from "./dist/lib/audioProbe.js";

const prisma = new PrismaClient();

async function main() {
  const tracks = await prisma.track.findMany({
    where: { durationSeconds: null },
    select: { id: true, title: true, fileUrl: true },
  });

  console.log(`Found ${tracks.length} tracks with no duration set.\n`);

  let succeeded = 0;
  let failed = 0;

  for (const track of tracks) {
    process.stdout.write(`Probing "${track.title}" (id ${track.id})... `);
    const duration = await probeAudioDuration(track.fileUrl);
    if (duration !== null) {
      await prisma.track.update({ where: { id: track.id }, data: { durationSeconds: duration } });
      console.log(`${duration}s`);
      succeeded++;
    } else {
      console.log("failed — could not determine duration, left as-is");
      failed++;
    }
  }

  console.log(`\nDone. ${succeeded} updated, ${failed} failed.`);
  if (failed > 0) {
    console.log("Failed tracks likely have an unreadable file URL or an unsupported/corrupt audio format — check those individually.");
  }
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
