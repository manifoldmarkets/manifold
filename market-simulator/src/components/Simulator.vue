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
          <td>{{ entry.yesPayout.value.toFixed(2) }}</td>
          <td>{{ entry.noPayout.value.toFixed(2) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { bids } from './orders'
import { ref, computed } from '@vue/reactivity'

const entries = [] as any
// Constants
const YES_SEED = 1
const NO_SEED = 9
// Regular variables
let yesPot = 0
let noPot = 0
// Reactive variables
const yesPotRef = ref(0)
const noPotRef = ref(0)
const yesWeightsRef = ref(0)
const noWeightsRef = ref(0)

// Calculations:
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
  yesWeightsRef.value += yesWeight
  noWeightsRef.value += noWeight
  const yesPayout = computed(
    () =>
      yesBid + (yesWeight / yesWeightsRef.value) * (noPotRef.value - NO_SEED)
  )
  const noPayout = computed(
    () => noBid + (noWeight / noWeightsRef.value) * (yesPotRef.value - YES_SEED)
  )

  entries.push({
    yesBid,
    noBid,
    // Show two decimal places
    yesWeight: yesWeight.toFixed(2),
    noWeight: noWeight.toFixed(2),
    prob: prob.toFixed(2),
    // These are reactive, so fix decimal places in HTML template
    yesPayout,
    noPayout,
  })
}

yesPotRef.value = yesPot
noPotRef.value = noPot
</script>
