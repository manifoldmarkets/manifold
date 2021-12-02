<template>
  <div class="overflow-x-auto px-12">
    <!-- Two-column layout (on large screen sizes) -->
    <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <!-- Left column -->
      <div>
        <h1 class="text-2xl font-bold text-gray-600 mb-8">
          Dynamic Parimutuel Market Simulator
        </h1>

        <label>Simulation step: {{ steps }} </label>
        <input
          class="range"
          type="range"
          v-model.number="steps"
          min="1"
          :max="bids.length"
        />

        <!-- Table to enter a new bid -->
        <table class="table table-compact my-8 w-full">
          <thead>
            <tr>
              <th>Order #</th>
              <th>Type</th>
              <th>Bid</th>
              <th>Weight</th>
              <th>Probability</th>
              <th>Payout</th>
              <th>Return</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>{{ steps + 1 }}</th>
              <td>
                <div
                  @click="toggleBidType"
                  class="badge clickable"
                  :class="newBidType == 'YES' ? 'badge-success' : 'badge-ghost'"
                >
                  YES
                </div>
                <br />
                <div
                  @click="toggleBidType"
                  class="badge clickable"
                  :class="newBidType == 'NO' ? 'badge-error' : 'badge-ghost'"
                >
                  NO
                </div>
              </td>
              <td>
                <input
                  type="number"
                  v-model.number="newBid"
                  placeholder="0"
                  class="input input-bordered"
                  @focus="$event.target.select()"
                />
              </td>
              <td>X</td>
              <td>X</td>
              <td>X</td>
              <td>X</td>
              <td>
                <button class="btn btn-primary" @click="submitBid">
                  Submit
                </button>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- List of historical bids -->
        <table class="table table-compact w-full">
          <thead>
            <tr>
              <th>Order #</th>
              <th>Type</th>
              <th>Bid</th>
              <th>Weight</th>
              <th>Probability</th>
              <th>Payout</th>
              <th>Return</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(entry, i) in entries">
              <th>{{ i + 1 }}</th>
              <template v-if="entry.yesBid && entry.noBid">
                <td><div class="badge">SEED</div></td>
                <td>{{ entry.yesBid }} / {{ entry.noBid }}</td>
                <td>N/A</td>
                <td>{{ entry.prob.toFixed(2) }}</td>
                <td>N/A</td>
                <td>N/A</td>
              </template>
              <template v-else-if="entry.yesBid">
                <td><div class="badge badge-success">YES</div></td>
                <td>{{ entry.yesBid }}</td>
                <td>{{ entry.yesWeight.toFixed(2) }}</td>
                <td>{{ entry.prob.toFixed(2) }}</td>
                <td>{{ entry.yesPayout.toFixed(2) }}</td>
                <td>{{ (entry.yesReturn * 100).toFixed(2) }}%</td>
              </template>
              <template v-else>
                <td><div class="badge badge-error">NO</div></td>
                <td>{{ entry.noBid }}</td>
                <td>{{ entry.noWeight.toFixed(2) }}</td>
                <td>{{ entry.prob.toFixed(2) }}</td>
                <td>{{ entry.noPayout.toFixed(2) }}</td>
                <td>{{ (entry.noReturn * 100).toFixed(2) }}%</td>
              </template>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Right column -->
      <div>
        <h1 class="text-2xl font-bold text-gray-600 mb-8">
          Probability of
          <div class="badge badge-success text-2xl h-8 w-18">YES</div>
        </h1>
        <canvas id="simChart" width="400" height="400"></canvas>
      </div>
    </div>
  </div>
</template>

<style scoped>
.clickable {
  cursor: pointer;
}
</style>

<script setup lang="ts">
import Chart from 'chart.js/auto'
import { bids as sampleBids } from './sample-bids'
import { makeEntries } from './entries'
import { ref, computed } from '@vue/reactivity'
import { onMounted, watch } from '@vue/runtime-core'

// Copy over the sample bids to seed the simulation
const bids = sampleBids.slice()

// UI parameters
const steps = ref(10)

// Computed variables: stop the simulation at the appropriate number of steps
const entries = computed(() => makeEntries(bids.slice(0, steps.value)))

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
    options: {
      plugins: {
        legend: {
          display: false,
        },
      },
    },
  })
}

function renderChart() {
  chart.data.labels = [...Array(steps.value).keys()]
  chart.data.datasets[0].data = probs.value
  chart.update()
}

// Add new data to the simulation, at the current step
const newBid = ref(0)
const newBidType = ref('YES')

function toggleBidType() {
  newBidType.value = newBidType.value === 'YES' ? 'NO' : 'YES'
}

function submitBid() {
  const bid = {
    yesBid: newBidType.value == 'YES' ? newBid.value : 0,
    noBid: newBidType.value == 'YES' ? 0 : newBid.value,
  }
  bids.splice(steps.value, 0, bid)
  steps.value++
}
</script>
