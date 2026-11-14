/**
 * Note drafts flushed by a Canvas that is already unmounting. The workspace sweep waits on
 * these before deleting empty Notes, so a delete can never overtake a draft still in flight.
 */
const detachedFlushes = new Set<Promise<void>>();

export function trackDetachedNoteFlush(flush: Promise<void>): void {
  detachedFlushes.add(flush);
}

/** Resolves true only when every tracked draft has been saved. Clears the tracker for the next leave. */
export async function settleDetachedNoteFlushes(): Promise<boolean> {
  const flushes = [...detachedFlushes];
  detachedFlushes.clear();
  const results = await Promise.allSettled(flushes);
  return results.every((result) => result.status === "fulfilled");
}
