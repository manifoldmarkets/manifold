import { Contract } from './contract'

// A/B test: after a bet placed on the market page, offer three related
// markets with one-tap bet buttons. Motivation (Sept 2026 analysis): 55% of
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
// A bet placed through the dialog the strip opened (binary markets only;
// multi-choice bets are attributed by time in the analysis).
export const NEXT_MARKET_PROMPT_BET_EVENT = 'next market prompt bet'

export const NEXT_MARKET_PROMPT_COUNT = 3
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
  return (
    contract.outcomeType === 'MULTIPLE_CHOICE' &&
    contract.mechanism === 'cpmm-multi-1'
  )
}

/**
 * Picks the markets to offer, in the order the candidates were supplied
 * (the related-markets endpoint already ranks by similarity).
 */
export const pickNextMarketCandidates = (
  candidates: readonly Contract[],
  opts: {
    sourceContractId: string
    token: Contract['token']
    excludeContractIds: ReadonlySet<string>
    isBlocked?: (contract: Contract) => boolean
    now?: number
    count?: number
  }
): Contract[] => {
  const now = opts.now ?? Date.now()
  const count = opts.count ?? NEXT_MARKET_PROMPT_COUNT
  const seen = new Set<string>([opts.sourceContractId])
  const picked: Contract[] = []
  for (const contract of candidates) {
    if (seen.has(contract.id)) continue
    seen.add(contract.id)
    if (opts.excludeContractIds.has(contract.id)) continue
    if (contract.token !== opts.token) continue
    if (!isNextMarketPromptCandidate(contract, { now })) continue
    if (opts.isBlocked?.(contract)) continue
    picked.push(contract)
    if (picked.length >= count) break
  }
  return picked
}
