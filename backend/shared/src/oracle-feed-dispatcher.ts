// A hung promise must not own a feed's polling slot forever. Retired work
// remains counted until it really settles: checkpoints stop its next step,
// but cannot cancel a database statement or a shared source request in flight.
export const ORACLE_POLL_DEADLINE_MS = 60_000
export const MAX_ABANDONED_POLLS_PER_FEED = 3
// Includes BOTH active and abandoned polls, reserved before starting work.
// The scheduler's DB pool has 40 connections; each poll does sequential work.
export const MAX_OUTSTANDING_ORACLE_POLLS = 20
const REFUSAL_LOG_INTERVAL_MS = 5 * 60_000

export class OraclePollAbandonedError extends Error {
  constructor() {
    super('Oracle poll was abandoned after its deadline')
  }
}

export type OraclePollProgress = {
  /** Before starting another read/write; throws if this run was abandoned. */
  checkpoint: (phase: string) => void
  /** Track completion of an already committed update without cancelling it. */
  setPhase: (phase: string) => void
}

type Poll = { phase: string; abandoned: boolean }

export const createOracleFeedDispatcher = (log: {
  info: (message: string) => void
  warn: (message: string) => void
  error: (message: string) => void
}) => {
  const active = new Map<string, Poll>()
  const outstanding = new Set<Poll>()
  const abandonedByFeed = new Map<string, number>()
  const lastAttempt = new Map<string, number>()
  const lastRefusalLog = new Map<
    string,
    { at: number; hasAbandoned: boolean }
  >()

  const dispatch = (
    feedId: string,
    run: (progress: OraclePollProgress) => Promise<void>
  ): boolean => {
    if (active.has(feedId)) return false
    const abandoned = abandonedByFeed.get(feedId) ?? 0
    if (
      abandoned >= MAX_ABANDONED_POLLS_PER_FEED ||
      outstanding.size >= MAX_OUTSTANDING_ORACLE_POLLS
    ) {
      const now = Date.now()
      const lastLog = lastRefusalLog.get(feedId)
      const hasAbandoned = outstanding.size > active.size
      if (
        lastLog == null ||
        now - lastLog.at >= REFUSAL_LOG_INTERVAL_MS ||
        (hasAbandoned && !lastLog.hasAbandoned)
      ) {
        lastRefusalLog.set(feedId, { at: now, hasAbandoned })
        const message = `[oracle-feeds] ${feedId}: refusing to poll; ${abandoned} abandoned on this feed, ${outstanding.size} outstanding in this process.`
        if (hasAbandoned)
          log.error(
            `${message} Polling resumes when work settles; restart the scheduler if it remains stuck.`
          )
        else log.warn(message)
      }
      return false
    }

    const poll: Poll = { phase: 'dispatch', abandoned: false }
    active.set(feedId, poll)
    outstanding.add(poll)
    lastAttempt.set(feedId, Date.now())
    lastRefusalLog.delete(feedId)
    // Progress belongs to this run, so a late completion cannot relabel its
    // replacement. Checkpoints deliberately do not abandon a transaction:
    // an update already committed must still publish its quote and notify.
    const progress: OraclePollProgress = {
      checkpoint: (phase) => {
        if (poll.abandoned) throw new OraclePollAbandonedError()
        poll.phase = phase
      },
      setPhase: (phase) => {
        poll.phase = phase
      },
    }
    const timer = setTimeout(() => {
      poll.abandoned = true
      active.delete(feedId)
      abandonedByFeed.set(feedId, (abandonedByFeed.get(feedId) ?? 0) + 1)
      log.error(
        `[oracle-feeds] ${feedId}: poll has been in flight for ${
          ORACLE_POLL_DEADLINE_MS / 1000
        }s in phase "${
          poll.phase
        }"; re-armed the feed, but the unfinished work is still counted (${
          outstanding.size
        } outstanding).`
      )
    }, ORACLE_POLL_DEADLINE_MS)
    timer.unref?.()

    // Also catches a callback that throws before returning its promise.
    void Promise.resolve()
      .then(() => run(progress))
      .catch((error: unknown) => {
        if (!(error instanceof OraclePollAbandonedError))
          log.error(
            `[oracle-feeds] ${feedId}: unhandled poll failure: ${error}`
          )
      })
      .finally(() => {
        clearTimeout(timer)
        outstanding.delete(poll)
        if (poll.abandoned) {
          const remaining = (abandonedByFeed.get(feedId) ?? 1) - 1
          if (remaining === 0) abandonedByFeed.delete(feedId)
          else abandonedByFeed.set(feedId, remaining)
          log.info(
            `[oracle-feeds] ${feedId}: abandoned poll settled; ${remaining} still outstanding on this feed`
          )
        } else {
          active.delete(feedId)
        }
      })
    return true
  }

  return {
    dispatch,
    lastAttemptAt: (feedId: string) => lastAttempt.get(feedId),
  }
}
