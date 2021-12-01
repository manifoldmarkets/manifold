<template>
  <div class="overflow-x-auto px-12">
    <table class="table">
      <thead>
        <tr>
          <th>Order #</th>
          <th>Yes bid</th>
          <th>No Bid</th>
          <th>Yes Weight</th>
          <th>No Weight</th>
          <th>Implied Probability</th>
          <th>Yes Payout</th>
          <th>No Payout</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(entry, i) in entries">
          <th>{{ i + 1 }}</th>
          <td>{{ entry.yesBid || '' }}</td>
          <td>{{ entry.noBid || '' }}</td>
          <td>{{ entry.yesWeight || '' }}</td>
          <td>{{ entry.noWeight || '' }}</td>
          <td>{{ entry.prob }}</td>
          <td>{{ entry.yesPayout }}</td>
          <td>{{ entry.noPayout }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { bids } from './orders'

const entries = [] as any
const YES_SEED = 1
const NO_SEED = 9
let yesPot = 0
let noPot = 0
let yesWeightSum = 0
let noWeightSum = 0
for (const bid of bids) {
  const { yesBid, noBid } = bid
  const yesWeight = noPot * (Math.log(yesBid + yesPot) - Math.log(yesPot)) || 0
  const noWeight = yesPot * (Math.log(noBid + noPot) - Math.log(noPot)) || 0

  // Note: Need to calculate weights BEFORE updating pot
  yesPot += yesBid
  noPot += noBid
  const prob = yesPot / (yesPot + noPot)

  // Payout: You get your initial bid back, as well as your share of the
  // (noPot - seed) according to your yesWeight
  yesWeightSum += yesWeight
  noWeightSum += noWeight
  // This only represents the payout if the market were to close immediately.
  // TODO: use refs to reactively update the payout
  const yesPayout = yesBid + (yesWeight / yesWeightSum) * (noPot - NO_SEED)
  const noPayout = noBid + (noWeight / noWeightSum) * (yesPot - YES_SEED)

  entries.push({
    yesBid,
    noBid,
    // Show two decimal places
    yesWeight: yesWeight.toFixed(2),
    noWeight: noWeight.toFixed(2),
    prob: prob.toFixed(2),
    yesPayout: yesPayout.toFixed(2),
    noPayout: noPayout.toFixed(2),
  })
}
</script>
