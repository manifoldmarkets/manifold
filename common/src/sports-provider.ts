/** Provider adapters retain stable entrant identities even when the feed changes its listing order. */
export type SportsProvider = 'odds' | 'bdl' | 'football-data' | 'fixture'

const statusStates = [
  'scheduled',
  'in_progress',
  'final',
  'postponed',
  'canceled',
  'delayed',
  'suspended',
  'abandoned',
  'unknown',
] as const
export type ProviderGameStatus = (typeof statusStates)[number]

/** Normalize only the source's documented lifecycle field. CBA's free text needs a verified adapter. */
export function normalizeBdlStatus(
  raw: unknown,
  source: 'status_state' | 'european-basketball-status' = 'status_state'
): ProviderGameStatus {
  if (source === 'european-basketball-status') {
    switch (raw) {
      case 'scheduled':
      case 'final':
      case 'postponed':
        return raw
      case 'live':
        return 'in_progress'
      case 'cancelled':
        return 'canceled'
      default:
        return 'unknown'
    }
  }
  return statusStates.find((status) => status === raw) ?? 'unknown'
}

export type ProviderEntrant = {
  id: string
  name: string
}

export type ProviderGame = {
  provider: SportsProvider
  league: string
  eventId: string
  startTimeMs: number | null
  status: ProviderGameStatus
  entrants: readonly ProviderEntrant[]
}

/** One vendor's quote. Each price is associated with an entrant or the draw outcome. */
export type ProviderOdds = {
  eventId: string
  vendor: string
  updatedAtMs: number
  outcomes: ReadonlyArray<{
    outcome: { entrantId: string } | 'draw'
    americanOdds: number
  }>
}

/** A missing winner is distinct from an affirmative draw or no contest. */
export type ProviderResult = {
  eventId: string
  status: ProviderGameStatus
  outcome: { winnerId: string } | 'draw' | 'no-contest' | null
  scores: ReadonlyArray<{ entrantId: string; score: number }>
  method: string | null
}
