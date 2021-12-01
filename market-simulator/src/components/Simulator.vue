<template>
  <div class="overflow-x-auto px-12">
    <label>Simulation step: {{ steps }} </label>
    <input
      class="range"
      type="range"
      v-model="steps"
      min="1"
      :max="entries.length"
    />

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
          <th>Yes Return</th>
          <th>No Return</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(entry, i) in truncatedEntries">
          <th>{{ i + 1 }}</th>
          <td>{{ entry.yesBid || '' }}</td>
          <td>{{ entry.noBid || '' }}</td>
          <td>{{ entry.yesWeight.toFixed(2) || '' }}</td>
          <td>{{ entry.noWeight.toFixed(2) || '' }}</td>
          <td>{{ entry.prob.toFixed(2) || '' }}</td>
          <td>{{ entry.yesPayout.value.toFixed(2) || '' }}</td>
          <td>{{ entry.noPayout.value.toFixed(2) || '' }}</td>
          <td>{{ (entry.yesReturn.value * 100).toFixed(2) || '' }}%</td>
          <td>{{ (entry.noReturn.value * 100).toFixed(2) || '' }}%</td>
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
// UI parameters
const steps = ref(10)

// Computed variables: stop the simulation at the appropriate number of steps
const truncatedEntries = computed(() => entries.slice(0, steps.value))
const yesPotC = computed(() =>
  truncatedEntries.value.reduce((acc, entry) => acc + entry.yesBid, 0)
)
const noPotC = computed(() =>
  truncatedEntries.value.reduce((acc, entry) => acc + entry.noBid, 0)
)
const yesWeightsC = computed(() =>
  truncatedEntries.value.reduce((acc, entry) => acc + entry.yesWeight, 0)
)
const noWeightsC = computed(() =>
  truncatedEntries.value.reduce((acc, entry) => acc + entry.noWeight, 0)
)

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
  const yesPayout = computed(
    () => yesBid + (yesWeight / yesWeightsC.value) * (noPotC.value - NO_SEED)
  )
  const noPayout = computed(
    () => noBid + (noWeight / noWeightsC.value) * (yesPotC.value - YES_SEED)
  )

  const yesReturn = computed(() => (yesPayout.value - yesBid) / yesBid)
  const noReturn = computed(() => (noPayout.value - noBid) / noBid)

  entries.push({
    yesBid,
    noBid,
    // Show two decimal places
    yesWeight: yesWeight,
    noWeight: noWeight,
    prob: prob,
    yesPayout,
    noPayout,
    yesReturn,
    noReturn,
  })
}
</script>
