import type { Group } from 'common/group'

type About = Group['about']

/**
 * Topic descriptions saved this session, by topic id, for an editor that
 * mounts again before the cached copy of its topic catches up (refetching
 * right after a save can still get the old one from the HTTP cache). It's
 * plain state outside React, so it holds whether or not the editor is
 * mounted.
 * - A save is recorded when it starts, so an editor that mounts while it's
 *   in flight starts from it. If it fails while still the latest, it goes
 *   back to the last description the server took.
 * - A topic's saves go to the server one at a time, so the last one wins.
 */
export function createDescriptionSaves(
  update: (topicId: string, about: About) => Promise<unknown>,
  onError: () => void
) {
  const latest = new Map<string, { about: About; seq: number }>()
  const confirmed = new Map<string, About>()
  const queues = new Map<string, Promise<unknown>>()
  let lastSeq = 0

  return {
    /** What an editor should start from: the latest save, else `own`. */
    current(topicId: string, own: About): About {
      const saved = latest.get(topicId)
      return saved ? saved.about : own
    },

    /** Saves `about`; `own` is the topic's description before any save. */
    save(topicId: string, about: About, own: About): Promise<void> {
      const seq = ++lastSeq
      latest.set(topicId, { about, seq })
      const request = (queues.get(topicId) ?? Promise.resolve())
        .catch(() => undefined)
        .then(() => update(topicId, about))
      queues.set(topicId, request)
      return request.then(
        () => {
          confirmed.set(topicId, about)
        },
        () => {
          if (latest.get(topicId)?.seq === seq)
            latest.set(topicId, {
              about: confirmed.has(topicId) ? confirmed.get(topicId) : own,
              seq,
            })
          onError()
        }
      )
    },
  }
}
