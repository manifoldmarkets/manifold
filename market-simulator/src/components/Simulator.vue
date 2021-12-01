<template>
  <div class="overflow-x-auto px-12">
    <label>Simulation step: {{ steps }} </label>
    <input
      class="range"
      type="range"
      v-model.number="steps"
      min="1"
      :max="bids.length"
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
              <th>Probability</th>
              <th>Payout</th>
              <th>Return</th>
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
    </div>
  </div>
</template>

<script setup lang="ts">
import Chart from 'chart.js/auto'
import { bids } from './sample-bids'
import { makeEntries } from './entries'
import { ref, computed } from '@vue/reactivity'
import { onMounted, watch } from '@vue/runtime-core'

// Need this import so script setup will export 'bids' lol
const BIDS_LENGTH = bids.length

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
  })
}

function renderChart() {
  chart.data.labels = [...Array(steps.value).keys()]
  chart.data.datasets[0].data = probs.value
  chart.update()
}
</script>
