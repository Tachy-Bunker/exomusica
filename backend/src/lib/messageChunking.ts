export const MESSAGE_CHUNK_SIZE = 300;

/** Splits an array into chunks of MESSAGE_CHUNK_SIZE (or a custom size).
 *  Used by anything that needs to walk a channel's full message history
 *  without loading it all into memory at once — the chat export feature
 *  and the Discord import tool both build on this. */
export function chunk<T>(items: T[], size: number = MESSAGE_CHUNK_SIZE): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

/** Walks a channel's entire message history in chunks, oldest first,
 *  calling `onChunk` for each batch. Uses the same cursor-based pagination
 *  as the live feed endpoint (paginate by position in creation order, not
 *  raw id — imported history can have ids that don't match creation order
 *  chronologically). `prisma` is passed in rather than imported to avoid a
 *  circular import between this lib and the routes that use it. */
export async function walkChannelHistoryInChunks(
  prisma: { message: { findMany: (args: unknown) => Promise<{ id: number }[]> } },
  channelId: number,
  onChunk: (chunk: { id: number }[]) => Promise<void>,
  chunkSize: number = MESSAGE_CHUNK_SIZE,
): Promise<void> {
  let cursor: number | undefined;
  while (true) {
    const batch = await prisma.message.findMany({
      where: { channelId },
      orderBy: { createdAt: "asc" },
      take: chunkSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (batch.length === 0) break;
    await onChunk(batch);
    cursor = batch[batch.length - 1].id;
    if (batch.length < chunkSize) break;
  }
}
