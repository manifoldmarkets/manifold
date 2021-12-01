<template>
  <div class="overflow-x-auto px-12">
    <label>Simulation step: {{ steps }} </label>
    <input
      class="range"
      type="range"
      v-model.number="steps"
      min="1"
      :max="allEntries.length"
    />
    <!-- Two-column layout (on large screen sizes) -->
    <div class="grid grid-cols-1 lg:grid-cols-2">
      <div>
        <canvas id="simChart" width="400" height="400"></canvas>
      </div>
      <div>
        <table class="table">
          <thead>
            <tr>
              <th>Order #</th>
              <th>Type</th>
              <th>Bid</th>
              <th>Weight</th>
              <th>Implied Probability</th>
              <th>Payout</th>
              <th>Return on win</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(entry, i) in entries">
              <th>{{ i + 1 }}</th>
              <template v-if="entry.yesBid">
                <td><div class="badge badge-success">YES</div></td>
                <td>{{ entry.yesBid }}</td>
                <td>{{ entry.yesWeight.toFixed(2) }}</td>
                <td>{{ entry.prob.toFixed(2) }}</td>
                <td>{{ entry.yesPayout.value.toFixed(2) }}</td>
                <td>{{ (entry.yesReturn.value * 100).toFixed(2) }}%</td>
              </template>
              <template v-else>
                <td><div class="badge badge-error">NO</div></td>
                <td>{{ entry.noBid }}</td>
                <td>{{ entry.noWeight.toFixed(2) }}</td>
                <td>{{ entry.prob.toFixed(2) }}</td>
                <td>{{ entry.noPayout.value.toFixed(2) }}</td>
                <td>{{ (entry.noReturn.value * 100).toFixed(2) }}%</td>
              </template>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import Chart from 'chart.js/auto'
import { bids } from './orders'
import { ref, computed } from '@vue/reactivity'
import { onMounted, watch } from '@vue/runtime-core'

const allEntries = [] as any
// Constants. TODO: Pull these from the orders instead of hardcoding.
const YES_SEED = 1
const NO_SEED = 9
// Regular variables
let yesPot = 0
let noPot = 0
// UI parameters
const steps = ref(10)

// Computed variables: stop the simulation at the appropriate number of steps
const entries = computed(() => allEntries.slice(0, steps.value))
const yesPotC = computed(() =>
  entries.value.reduce((acc, entry) => acc + entry.yesBid, 0)
)
const noPotC = computed(() =>
  entries.value.reduce((acc, entry) => acc + entry.noBid, 0)
)
const yesWeightsC = computed(() =>
  entries.value.reduce((acc, entry) => acc + entry.yesWeight, 0)
)
const noWeightsC = computed(() =>
  entries.value.reduce((acc, entry) => acc + entry.noWeight, 0)
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

  allEntries.push({
    yesBid,
    noBid,
    // Show two decimal places
    yesWeight,
    noWeight,
    prob,
    yesPayout,
    noPayout,
    yesReturn,
    noReturn,
  })
}

// Graph the probabilities over time
const probs = computed(() => entries.value.map((entry) => entry.prob))

onMounted(initChart)
watch(steps, renderChart)

let chart: Chart
function initChart() {
  const ctx = document.getElementById('simChart')
  chart = new Chart(ctx as any, {
    type: 'line',
    data: {
      labels: [...Array(steps.value).keys()],
      datasets: [
        {
          label: 'Implied probability',
          data: probs.value,
          borderColor: 'rgb(75, 192, 192)',
        },
      ],
    },
  })
}

function renderChart() {
  chart.data.labels = [...Array(steps.value).keys()]
  chart.data.datasets[0].data = probs.value
  chart.update()
}
</script>
