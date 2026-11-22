import type { F1Session } from 'common/f1-markets'

/** An HTTP response arrived, but cannot establish the requested sporting fact. */
export class F1ReadEvidenceError extends Error {
  constructor(
    readonly resource:
      | 'sessions'
      | 'session_results'
      | 'driver_standings'
      | 'team_standings'
      | 'market_field',
    message: string,
    readonly disputed?: {
      sessionIds: ReadonlySet<number>
      verifiedSiblings: F1Session[]
    }
  ) {
    super(message)
  }
}

/** Run after the entire scoped page walk, so duplicates on later pages also count. */
export function verifiedF1Sessions(rows: F1Session[]): F1Session[] {
  const byId = new Map<number, F1Session>()
  const conflicts = new Set<number>()
  for (const row of rows) {
    if (!Number.isSafeInteger(row.id) || row.id <= 0)
      throw new F1ReadEvidenceError(
        'sessions',
        'The F1 schedule contains an unidentified session'
      )
    const prior = byId.get(row.id)
    if (
      prior &&
      (prior.event.id !== row.event.id ||
        prior.event.season !== row.event.season ||
        prior.status_state !== row.status_state ||
        prior.type !== row.type ||
        prior.name !== row.name ||
        prior.date !== row.date)
    ) {
      conflicts.add(row.id)
    }
    byId.set(row.id, row)
  }
  if (conflicts.size)
    throw new F1ReadEvidenceError(
      'sessions',
      'The F1 schedule gives conflicting details for the same session',
      {
        sessionIds: conflicts,
        verifiedSiblings: [...byId.values()].filter(
          (row) => !conflicts.has(row.id)
        ),
      }
    )
  return [...byId.values()]
}

export const validF1Id = (id: unknown): id is number =>
  typeof id === 'number' && Number.isSafeInteger(id) && id > 0

export const validF1Entrants = (ids: unknown): ids is (number | null)[] =>
  Array.isArray(ids) &&
  ids.some(validF1Id) &&
  Array.from(ids).every((id) => id === null || validF1Id(id))
