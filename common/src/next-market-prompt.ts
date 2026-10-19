import { Contract, isMultiCpmm } from './contract'

// A/B test: after a bet placed on the market page, offer one related market
// and another after each suggested-market trade. Motivation (Sept 2026 analysis): 55% of
// betting days involve exactly one market, and only 26% of users bet on
// another market within 30 minutes of their first bet of the day, versus
// 60% after any later bet.
export const NEXT_MARKET_PROMPT_TEST_NAME = 'next-market-prompt-v1'
export const NEXT_MARKET_PROMPT_VARIANTS = ['control', 'treatment'] as const
export type NextMarketPromptVariant =
  (typeof NEXT_MARKET_PROMPT_VARIANTS)[number]

// Logged for every market-page bet in both arms: the triggered population.
export const NEXT_MARKET_PROMPT_TRIGGER_EVENT = 'next market prompt trigger'
// Treatment only: the strip rendered with at least one candidate.
export const NEXT_MARKET_PROMPT_SHOWN_EVENT = 'next market prompt shown'
// A tap on a candidate's question, Yes, No or Bet.
export const NEXT_MARKET_PROMPT_CLICK_EVENT = 'next market prompt click'
// A bet placed through the binary or multiple-choice dialog the strip opened.
export const NEXT_MARKET_PROMPT_BET_EVENT = 'next market prompt bet'
// The user closed the strip with its X.
export const NEXT_MARKET_PROMPT_DISMISS_EVENT = 'next market prompt dismiss'
// Treatment only: a trigger that produced no eligible candidate, with the
// counts at each filtering step, so the empty rate is measurable.
export const NEXT_MARKET_PROMPT_EMPTY_EVENT = 'next market prompt empty'

export const NEXT_MARKET_PROMPT_COUNT = 1
export const NEXT_MARKET_PROMPT_MIN_PROB = 0.05
export const NEXT_MARKET_PROMPT_MAX_PROB = 0.95

// Bet panels that live on the market page itself. Bets from Browse rows,
// feed cards and comments already leave the user on a list, so they do not
// trigger the prompt; neither do bets placed from the prompt's own dialog.
export const NEXT_MARKET_PROMPT_LOCATIONS: readonly string[] = [
  'bet panel',
  'contract page answer',
]
export const isNextMarketPromptLocation = (location: string | undefined) =>
  !!location && NEXT_MARKET_PROMPT_LOCATIONS.includes(location)

// Where the strip renders. The binary bet panel stays open after a bet, so
// its strip sits inside that panel, right under "Trade placed". Answer
// panels (multiple choice, versus) close themselves after a bet, so their
// strip renders on the page under the overview instead.
export type NextMarketPromptPlacement = 'panel' | 'page'
export const getNextMarketPromptPlacement = (
  location: string | undefined
): NextMarketPromptPlacement => (location === 'bet panel' ? 'panel' : 'page')

export const isNextMarketPromptCandidate = (
  contract: Contract,
  opts: { now: number; minProb?: number; maxProb?: number }
) => {
  if (contract.isResolved || contract.deleted) return false
  if (contract.visibility !== 'public') return false
  if (contract.closeTime !== undefined && contract.closeTime <= opts.now)
    return false
  if (contract.outcomeType === 'BINARY' && contract.mechanism === 'cpmm-1') {
    const { prob } = contract
    return (
      prob >= (opts.minProb ?? NEXT_MARKET_PROMPT_MIN_PROB) &&
      prob <= (opts.maxProb ?? NEXT_MARKET_PROMPT_MAX_PROB)
    )
  }
  return contract.outcomeType === 'MULTIPLE_CHOICE' && isMultiCpmm(contract)
}

/**
 * Picks the markets to offer, in the order the candidates were supplied
 * (the related-markets endpoint already ranks by similarity). When hydrated
 * contracts are supplied, their full, current data is used for filtering;
 * candidates missing from that response are excluded.
 */
export const pickNextMarketCandidates = (
  candidates: readonly Contract[],
  opts: {
    sourceContractId: string
    token: Contract['token']
    excludeContractIds: ReadonlySet<string>
    isBlocked?: (contract: Contract) => boolean
    hydratedContracts?: readonly Contract[]
    now?: number
    count?: number
  }
): Contract[] => {
  const now = opts.now ?? Date.now()
  const count = opts.count ?? NEXT_MARKET_PROMPT_COUNT
  if (count <= 0) return []
  const hydratedById = opts.hydratedContracts
    ? new Map(opts.hydratedContracts.map((c) => [c.id, c]))
    : undefined
  const seen = new Set<string>([opts.sourceContractId])
  const picked: Contract[] = []
  for (const candidate of candidates) {
    const contract = hydratedById ? hydratedById.get(candidate.id) : candidate
    if (!contract) continue
    if (seen.has(contract.id)) continue
    seen.add(contract.id)
    if (opts.excludeContractIds.has(contract.id)) continue
    if (contract.token !== opts.token) continue
    if (!isNextMarketPromptCandidate(contract, { now })) continue
    if (
      hydratedById &&
      contract.outcomeType === 'MULTIPLE_CHOICE' &&
      !contract.answers?.length
    )
      continue
    if (opts.isBlocked?.(contract)) continue
    picked.push(contract)
    if (picked.length >= count) break
  }
  return picked
}

/** Related-market snapshots can omit token, answers and topic metadata.
 * Fetch authoritative contracts before applying eligibility or currency checks.
 */
export const loadNextMarketCandidates = async (
  candidates: readonly Contract[],
  opts: Omit<
    Parameters<typeof pickNextMarketCandidates>[1],
    'hydratedContracts' | 'count'
  >,
  loadContracts: (ids: string[]) => Promise<Contract[]>
) => {
  const ids = [...new Set(candidates.map((c) => c.id))].filter(
    (id) => id !== opts.sourceContractId && !opts.excludeContractIds.has(id)
  )
  const full = ids.length ? await loadContracts(ids) : []
  return {
    requestedCount: ids.length,
    hydratedCount: full.length,
    ready: pickNextMarketCandidates(candidates, {
      ...opts,
      hydratedContracts: full,
      count: candidates.length,
    }),
  }
}

export type NextMarketPromptQueue = {
  shown: Contract[]
  remaining: Contract[]
  completedIds: string[]
}

/** Keep ranked reserves, revealing one new pick per distinct completed market.
 * A completion can arrive before its prefetched candidates; the unfilled slot
 * survives until a later update. Previously shown markets never reappear.
 */
export const updateNextMarketPromptQueue = (
  queue: NextMarketPromptQueue,
  candidates: readonly Contract[],
  opts: Parameters<typeof pickNextMarketCandidates>[1],
  completedId?: string
): NextMarketPromptQueue => {
  const completedIds =
    completedId &&
    queue.shown.some((c) => c.id === completedId) &&
    !queue.completedIds.includes(completedId)
      ? [...queue.completedIds, completedId]
      : queue.completedIds
  const pool = [...queue.remaining, ...candidates]
  const remaining = pickNextMarketCandidates(pool, {
    ...opts,
    excludeContractIds: new Set([
      ...opts.excludeContractIds,
      ...queue.shown.map((c) => c.id),
    ]),
    count: pool.length,
  })
  const slots = Math.max(
    0,
    NEXT_MARKET_PROMPT_COUNT + completedIds.length - queue.shown.length
  )
  return {
    shown: [...queue.shown, ...remaining.slice(0, slots)],
    remaining: remaining.slice(slots),
    completedIds,
  }
}
