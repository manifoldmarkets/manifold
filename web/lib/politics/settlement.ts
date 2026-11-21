// What a resolved market paid, read from its recorded resolution rather than
// its prices. A market resolved as a whole names its result on the contract
// (resolution, resolutions) and leaves every answer's pool where it was, so
// a resolved market read by price shows the odds before the result. One
// module so every result display on the election pages reads it alike.

import { getAnswerProbability } from 'common/calculate'
import { Contract, isMultiCpmm } from 'common/contract'
import { sourceAudit } from 'web/components/usa-map/audited-sources'
import {
  getPartyProbs,
  isDemocraticAnswer,
  isRepublicanAnswer,
} from 'web/components/usa-map/state-election-map'

// The party a resolved race market went to, from the resolution it records.
// A market resolved as a whole names its winning answer in `resolution` and
// leaves every answer's pool (so its price) as it was, so prices can't be
// trusted for the call: a race resolved Democratic at D 80 / R 19 is still
// D. A yes/no market's YES is the party `yesParty` says; without it a yes/no
// market isn't called (a "Will the Democrat win" framing would flip a
// guess). Undefined while open, for a cancelled market, and for a split
// with no single winner (a yes/no market resolved to a probability).
export function resolvedParty(
  market: {
    isResolved?: boolean
    resolution?: string
    outcomeType: string
    answers?: { id: string; text: string; resolution?: string }[]
  },
  partyOfAnswer: (text: string) => 'D' | 'R' | 'O',
  yesParty?: 'D' | 'R'
): 'D' | 'R' | 'O' | undefined {
  const { isResolved, resolution } = market
  if (!isResolved || !resolution || resolution === 'CANCEL') return undefined
  if (market.outcomeType === 'BINARY') {
    if (!yesParty || resolution === 'MKT') return undefined
    if (resolution === 'YES') return yesParty
    if (resolution === 'NO') return yesParty === 'D' ? 'R' : 'D'
    return undefined
  }
  const id = resolvedAnswerId(market)
  const won = market.answers?.find((a) => a.id === id)
  return won ? partyOfAnswer(won.text) : undefined
}

// The answer a resolved multiple-choice market went to, by its recorded
// resolution, never by its prices: the one answer resolved YES, the answer
// id a whole-market resolution names, or the one answer a split
// (CHOOSE_MULTIPLE or MKT, shares in `resolutions`) gives 100%. Undefined
// while open, for a cancelled market, and for a split with no single
// winner.
export function resolvedAnswerId(market: {
  isResolved?: boolean
  resolution?: string
  resolutions?: { [answerId: string]: number }
  answers?: { id: string; resolution?: string }[]
}): string | undefined {
  const { isResolved, resolution } = market
  if (!isResolved || !resolution || resolution === 'CANCEL') return undefined
  const yes = market.answers?.filter((a) => a.resolution === 'YES') ?? []
  if (yes.length === 1) return yes[0].id
  const shares = recordedShares(market)
  if (shares) {
    const whole = Object.keys(shares).filter((id) => shares[id] >= 100)
    return whole.length === 1 ? whole[0] : undefined
  }
  return market.answers?.find((a) => a.id === resolution)?.id
}

// An answer's chance as the page shows it: what a resolved market paid it
// (1 for the winner, 0 for the rest, or its recorded share of a split),
// else its price. Resolving leaves the prices where they were, so a
// resolved market read by price shows the odds before the result. An
// answer resolved on its own (independent answers settle one by one) pays
// what its own resolution says.
export function settledOrPrice(
  market: {
    isResolved?: boolean
    resolution?: string
    resolutions?: { [answerId: string]: number }
    answers?: {
      id: string
      resolution?: string
      resolutionProbability?: number
    }[]
  },
  answerId: string,
  price: (answerId: string) => number
): number {
  const own = market.answers?.find((a) => a.id === answerId)
  if (own?.resolution === 'YES') return 1
  if (own?.resolution === 'NO') return 0
  if (own?.resolution === 'MKT' && Number.isFinite(own.resolutionProbability))
    return own.resolutionProbability as number
  const winner = resolvedAnswerId(market)
  if (winner) return answerId === winner ? 1 : 0
  const shares = recordedShares(market)
  if (shares) return (shares[answerId] ?? 0) / 100
  return price(answerId)
}

// A split resolution's recorded shares, in percent by answer id: what a
// market resolved CHOOSE_MULTIPLE or MKT pays each answer (its prices stay
// where they were). Undefined for anything else.
export function recordedShares(market: {
  isResolved?: boolean
  resolution?: string
  resolutions?: { [answerId: string]: number }
}): { [answerId: string]: number } | undefined {
  const { isResolved, resolution, resolutions } = market
  if (!isResolved || !resolution || resolution === 'CANCEL') return undefined
  return resolutions && Object.keys(resolutions).length > 0
    ? resolutions
    : undefined
}

// A party market's Democratic, Republican and other chances as the page
// shows them: a resolved market's result, else its prices (getPartyProbs,
// which reads the answer pools a whole-market resolution leaves where they
// were). A yes/no market keeps getPartyProbs' reading, YES = Republican, for
// its result too; an audited market keeps the audit's reading.
export function settledPartyProbs(contract: Contract | null) {
  const probs = getPartyProbs(contract)
  if (!probs || !contract || !contract.isResolved) return probs
  if (sourceAudit(contract.slug)) return probs
  if (isMultiCpmm(contract)) {
    if (!resolvedAnswerId(contract) && !recordedShares(contract)) return probs
    const sum = (keep: (text: string) => boolean) =>
      contract.answers
        .filter((a) => keep(a.text))
        .reduce(
          (s, a) =>
            s +
            settledOrPrice(contract, a.id, (id) =>
              getAnswerProbability(contract, id)
            ),
          0
        )
    return {
      dem: sum(isDemocraticAnswer),
      rep: sum(isRepublicanAnswer),
      other: sum((t) => !isDemocraticAnswer(t) && !isRepublicanAnswer(t)),
    }
  }
  if (contract.resolution === 'YES') return { dem: 0, rep: 1, other: 0 }
  if (contract.resolution === 'NO') return { dem: 1, rep: 0, other: 0 }
  return probs
}

// A multiple-choice market's answers by what they pay or cost, highest
// first, at most `n`. Open, the named ones (Other is a bucket, not a pick);
// resolved, whatever it paid, Other included: the winner leads at 1 however
// its pools stood, and the answers it paid nothing drop off.
export function rankedAnswers<
  A extends {
    id: string
    text: string
    resolution?: string
    resolutionProbability?: number
  }
>(
  market: {
    isResolved?: boolean
    resolution?: string
    resolutions?: { [answerId: string]: number }
    answers: A[]
  },
  price: (answerId: string) => number,
  n: number
): { answer: A; p: number }[] {
  const settled = market.isResolved && market.resolution !== 'CANCEL'
  const answers: A[] = market.answers
  return answers
    .filter((a) => settled || !/^other\b/i.test(a.text.trim()))
    .map((a) => ({ answer: a, p: settledOrPrice(market, a.id, price) }))
    .filter((x) => !(settled && x.p <= 0))
    .sort((x, y) => y.p - x.p)
    .slice(0, n)
}
