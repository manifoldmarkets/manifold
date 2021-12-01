type Bid = { yesBid: number; noBid: number }

// An entry has a yes/no for bid, weight, payout, return. Also a current probability
type Entry = {
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

export function makeEntries(bids: Bid[]): Entry[] {
  const entries: Entry[] = []
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

    entries.push({
      yesBid,
      noBid,
      yesWeight,
      noWeight,
      prob,
      // To be filled in below
      yesPayout: 0,
      noPayout: 0,
      yesReturn: 0,
      noReturn: 0,
    })
  }

  const YES_SEED = bids[0].yesBid
  const NO_SEED = bids[0].noBid
  const yesWeightsSum = entries.reduce((sum, entry) => sum + entry.yesWeight, 0)
  const noWeightsSum = entries.reduce((sum, entry) => sum + entry.noWeight, 0)
  // Second pass: calculate all the payouts
  for (const entry of entries) {
    const { yesBid, noBid, yesWeight, noWeight } = entry
    // Payout: You get your initial bid back, as well as your share of the
    // (noPot - seed) according to your yesWeight
    entry.yesPayout = yesBid + (yesWeight / yesWeightsSum) * (noPot - NO_SEED)
    entry.noPayout = noBid + (noWeight / noWeightsSum) * (yesPot - YES_SEED)
    entry.yesReturn = (entry.yesPayout - yesBid) / yesBid
    entry.noReturn = (entry.noPayout - noBid) / noBid
  }
  return entries
}
