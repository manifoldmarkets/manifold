type Bid = { yesBid: number; noBid: number }

// An entry has a yes/no for bid, weight, payout, return. Also a current probability
export type Entry = {
  yesBid: number
  noBid: number
  yesWeight: number
  noWeight: number
  yesPayout: number
  noPayout: number
  yesReturn: number
  noReturn: number
  prob: number
}

function makeWeights(bids: Bid[]) {
  const weights = []
  let yesPot = 0
  let noPot = 0
  // First pass: calculate all the weights
  for (const { yesBid, noBid } of bids) {
    const yesWeight =
      noPot * (Math.log(yesBid + yesPot) - Math.log(yesPot)) || 0
    const noWeight = yesPot * (Math.log(noBid + noPot) - Math.log(noPot)) || 0

    // Note: Need to calculate weights BEFORE updating pot
    yesPot += yesBid
    noPot += noBid
    const prob = yesPot / (yesPot + noPot)

    weights.push({
      yesBid,
      noBid,
      yesWeight,
      noWeight,
      prob,
    })
  }
  return weights
}

export function makeEntries(bids: Bid[]): Entry[] {
  const YES_SEED = bids[0].yesBid
  const NO_SEED = bids[0].noBid
  const weights = makeWeights(bids)
  const yesPot = weights.reduce((sum, { yesBid }) => sum + yesBid, 0)
  const noPot = weights.reduce((sum, { noBid }) => sum + noBid, 0)
  const yesWeightsSum = weights.reduce((sum, entry) => sum + entry.yesWeight, 0)
  const noWeightsSum = weights.reduce((sum, entry) => sum + entry.noWeight, 0)
  // Second pass: calculate all the payouts
  const entries: Entry[] = []
  for (const weight of weights) {
    const { yesBid, noBid, yesWeight, noWeight } = weight
    // Payout: You get your initial bid back, as well as your share of the
    // (noPot - seed) according to your yesWeight
    const yesPayout = yesBid + (yesWeight / yesWeightsSum) * (noPot - NO_SEED)
    const noPayout = noBid + (noWeight / noWeightsSum) * (yesPot - YES_SEED)
    const yesReturn = (yesPayout - yesBid) / yesBid
    const noReturn = (noPayout - noBid) / noBid
    entries.push({ ...weight, yesPayout, noPayout, yesReturn, noReturn })
  }
  return entries
}
