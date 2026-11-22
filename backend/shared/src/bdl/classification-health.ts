import {
  checkedClassification,
  type F1Session,
  type F1SessionResult,
} from 'common/f1-markets'

export type ClassificationSample = {
  sessionId: number
  competitionId: string
  startedAt: number
  observedAt: number
  empty: boolean
}

const positiveId = (n: unknown) =>
  typeof n === 'number' && Number.isSafeInteger(n) && n > 0

// A malformed list or capped pagination throws before the F1 client returns.
export function observeClassification(
  sessions: readonly F1Session[],
  session: F1Session,
  results: F1SessionResult[],
  startedAt: number,
  observedAt: number
): ClassificationSample | undefined {
  const season = session.event?.season
  if (
    !positiveId(session.id) ||
    !positiveId(session.event?.id) ||
    !Number.isInteger(season) ||
    season < 1000 ||
    season > 9999 ||
    session.status_state !== 'final' ||
    observedAt < startedAt ||
    sessions.some(
      (s) =>
        s.id === session.id &&
        (s.event?.id !== session.event.id ||
          s.event?.season !== season ||
          s.status_state !== 'final')
    )
  )
    return
  if (
    results.length &&
    (results.some(
      (row) =>
        row?.session?.id !== session.id ||
        !positiveId(row.driver?.id) ||
        (row.position !== null && !positiveId(row.position)) ||
        typeof row.is_winner !== 'boolean'
    ) ||
      !checkedClassification(results)?.first)
  )
    return
  return {
    sessionId: session.id,
    competitionId: `f1-${season}`,
    startedAt,
    observedAt,
    empty: results.length === 0,
  }
}
