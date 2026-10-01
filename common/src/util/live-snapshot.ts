/** A shared snapshot with ordered refreshes and an overlay of live updates.
 * Updates received during a read win over that read. Starting a newer read
 * makes every older response obsolete, even if the newer read fails. */
export function createLiveSnapshot<T extends { id: string }>(
  normalize: (values: T[]) => T[] = (values) => values
) {
  let snapshot: T[] | undefined
  let generation = 0
  let updates: Map<string, T> | undefined
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
      for (const value of changes) updates?.set(value.id, value)
      publish(merge(snapshot ?? [], changes))
    },
    // Used to remove orders when their expiry time is reached.
    normalize: () => {
      if (snapshot) publish(snapshot)
    },
    refresh: async (read: () => Promise<T[]>) => {
      const current = ++generation
      updates = new Map()
      try {
        const values = await read()
        if (generation === current) {
          publish(merge(values, Array.from(updates?.values() ?? [])))
        }
      } finally {
        if (generation === current) updates = undefined
      }
    },
  }
}
