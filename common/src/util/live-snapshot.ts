/** A shared snapshot with ordered refreshes and an overlay of live updates.
 * Updates received during a read win over that read. A response is dropped
 * once a newer read's response has been published; until then it replaces
 * the older snapshot, so a slow or failed newer read can't discard it. */
export function createLiveSnapshot<T extends { id: string }>(
  normalize: (values: T[]) => T[] = (values) => values
) {
  let snapshot: T[] | undefined
  let started = 0
  let published = 0
  // Live updates received since each in-flight read started.
  const overlays = new Map<number, Map<string, T>>()
  const listeners = new Set<() => void>()

  const publish = (values: T[]) => {
    snapshot = normalize(values)
    // React can subscribe or unsubscribe while a listener runs.
    for (const listener of Array.from(listeners)) listener()
  }
  const merge = (values: T[], changes: T[]) =>
    Array.from(new Map([...values, ...changes].map((v) => [v.id, v])).values())

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    update: (changes: T[]) => {
      for (const overlay of overlays.values())
        for (const value of changes) overlay.set(value.id, value)
      publish(merge(snapshot ?? [], changes))
    },
    // Used to remove orders when their expiry time is reached.
    normalize: () => {
      if (snapshot) publish(snapshot)
    },
    refresh: async (read: () => Promise<T[]>) => {
      const generation = ++started
      const overlay = new Map<string, T>()
      overlays.set(generation, overlay)
      try {
        const values = await read()
        if (generation > published) {
          published = generation
          // Older reads still in flight can no longer be published.
          for (const older of overlays.keys())
            if (older < generation) overlays.delete(older)
          publish(merge(values, Array.from(overlay.values())))
        }
      } finally {
        overlays.delete(generation)
      }
    },
  }
}
