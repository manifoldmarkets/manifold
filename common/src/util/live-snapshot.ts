/** A shared snapshot with ordered refreshes and a log of live updates. Each
 * response is overlaid with the live updates it may not include: those
 * received since its read started, and, when responses can come from a cache,
 * those received up to `maxAge` ms before. A response is dropped once a newer
 * read's response has been published; until then it replaces the older
 * snapshot, so a slow or failed newer read can't discard it. */
export function createLiveSnapshot<T extends { id: string }>(
  normalize: (values: T[]) => T[] = (values) => values,
  maxAge = 0
) {
  let snapshot: T[] | undefined
  let started = 0
  let published = 0
  let received = 0
  // Live updates, oldest first, kept while a read could still need them.
  let log: { seq: number; at: number; value: T }[] = []
  // Where each read in flight started.
  const reads = new Map<number, { seq: number; at: number }>()
  const listeners = new Set<() => void>()

  const publish = (values: T[]) => {
    snapshot = normalize(values)
    // React can subscribe or unsubscribe while a listener runs.
    for (const listener of Array.from(listeners)) listener()
  }
  const merge = (values: T[], changes: T[]) =>
    Array.from(new Map([...values, ...changes].map((v) => [v.id, v])).values())
  const missedBy =
    (read: { seq: number; at: number }) => (u: (typeof log)[0]) =>
      u.seq >= read.seq || u.at > read.at - maxAge
  const prune = () => {
    // Also covers a read that starts now.
    const oldest = { seq: received + 1, at: Date.now() }
    for (const read of reads.values()) {
      oldest.seq = Math.min(oldest.seq, read.seq)
      oldest.at = Math.min(oldest.at, read.at)
    }
    log = log.filter(missedBy(oldest))
  }

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    update: (changes: T[]) => {
      const at = Date.now()
      for (const value of changes) log.push({ seq: ++received, at, value })
      prune()
      publish(merge(snapshot ?? [], changes))
    },
    // Used to remove orders when their expiry time is reached.
    normalize: () => {
      if (snapshot) publish(snapshot)
    },
    refresh: async (read: () => Promise<T[]>) => {
      const generation = ++started
      const start = { seq: received + 1, at: Date.now() }
      reads.set(generation, start)
      try {
        const values = await read()
        if (generation > published) {
          published = generation
          // Older reads still in flight can no longer be published.
          for (const older of reads.keys())
            if (older < generation) reads.delete(older)
          const missed = log.filter(missedBy(start)).map((u) => u.value)
          publish(merge(values, missed))
        }
      } finally {
        reads.delete(generation)
        prune()
      }
    },
  }
}
