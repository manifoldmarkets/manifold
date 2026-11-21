import { min, sum } from 'lodash'

// Rebalance math for sum-to-one multi-choice markets.
//
// Share identity: 1 NO in outcome i is equivalent to 1 YES in every outcome j != i.
// Using this identity we can convert a mixed YES/NO position into an all-YES
// position and redeem the minimum-across-outcomes of YES shares at $1 each.
// The post-rebalance state has NO=0 in every outcome and YES=0 in at least one.
//
// This is pure accounting — no AMM interaction, no probability movement, no
// fees. The caller is responsible for applying the deltas and crediting cash
// inside a database transaction.

export type RebalanceInput = {
  answerIds: string[]
  yesShares: Record<string, number>
  noShares: Record<string, number>
}

export type RebalanceOutput = {
  minShares: number
  cashRedeemed: number
  yesDelta: Record<string, number>
  noDelta: Record<string, number>
  finalYesShares: Record<string, number>
}

export function computeRebalance(input: RebalanceInput): RebalanceOutput {
  const { answerIds, yesShares, noShares } = input

  const totalNo = sum(answerIds.map((id) => noShares[id] ?? 0))

  const effectiveYes: Record<string, number> = {}
  for (const id of answerIds) {
    const ys = yesShares[id] ?? 0
    const ns = noShares[id] ?? 0
    effectiveYes[id] = ys + (totalNo - ns)
  }

  const minShares = Math.max(0, min(Object.values(effectiveYes)) ?? 0)

  const yesDelta: Record<string, number> = {}
  const noDelta: Record<string, number> = {}
  const finalYesShares: Record<string, number> = {}

  // `x + 0` canonicalizes -0 to +0 so callers and tests get consistent zeros.
  const norm = (x: number) => x + 0

  for (const id of answerIds) {
    const ys = yesShares[id] ?? 0
    const ns = noShares[id] ?? 0
    const finalYes = effectiveYes[id] - minShares
    finalYesShares[id] = norm(finalYes)
    yesDelta[id] = norm(finalYes - ys)
    noDelta[id] = norm(-ns)
  }

  return {
    minShares,
    cashRedeemed: minShares,
    yesDelta,
    noDelta,
    finalYesShares,
  }
}
