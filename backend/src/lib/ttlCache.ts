/** Remember an expensive result for a short time; visitors arriving together share one computation. */
export function ttlCache<T>(ms: number, compute: () => Promise<T>): () => Promise<T> {
  let value: { at: number; data: T } | null = null;
  let inflight: Promise<T> | null = null;
  return async () => {
    if (value && Date.now() - value.at <= ms) return value.data;
    inflight ??= compute().finally(() => { inflight = null; });
    const data = await inflight;
    value = { at: Date.now(), data };
    return data;
  };
}
