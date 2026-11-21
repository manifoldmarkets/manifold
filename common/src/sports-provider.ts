/** Provider adapters retain stable entrant identities even when the feed changes its listing order. */
export const SPORTS_DATA_PROVIDER_LABELS = {
  odds: 'The Odds API',
  bdl: 'BALLDONTLIE',
  'football-data': 'football-data.org',
} as const

export type SportsDataProvider = keyof typeof SPORTS_DATA_PROVIDER_LABELS
export const SPORTS_DATA_PROVIDERS = Object.keys(
  SPORTS_DATA_PROVIDER_LABELS
) as readonly SportsDataProvider[]
export const isSportsDataProvider = (
  value: unknown
): value is SportsDataProvider =>
  typeof value === 'string' &&
  Object.prototype.hasOwnProperty.call(SPORTS_DATA_PROVIDER_LABELS, value)
export type SportsProvider = SportsDataProvider | 'fixture'

export const SPORTS_PROVIDER_PREFIXES: readonly (readonly [
  string,
  SportsProvider
])[] = [
  ['odds:', 'odds'],
  ['bdl-f1:', 'bdl'],
  ['bdl-f1-title:', 'bdl'],
  ['bdl:', 'bdl'],
  ['fd-', 'football-data'],
  ['fixture:', 'fixture'],
]

/** Older sports contracts record only the provider-specific event ID. */
export function providerOf(contract: {
  sportsProvider?: SportsProvider | null
  sportsEventId?: string | null
}): SportsProvider | 'legacy' {
  if (contract.sportsProvider != null) return contract.sportsProvider
  const id = contract.sportsEventId
  return (
    SPORTS_PROVIDER_PREFIXES.find(([prefix]) => id?.startsWith(prefix))?.[1] ??
    'legacy'
  )
}

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
