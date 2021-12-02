<!-- Partial table row for a given entry -->
<template>
  <!-- Invalid bid -->
  <template v-if="!entry">
    <td>N/A</td>
    <td>N/A</td>
    <td>N/A</td>
    <td>N/A</td>
  </template>
  <!-- Seed bids -->
  <template v-else-if="entry.yesBid && entry.noBid">
    <td>N/A</td>
    <td>{{ entry.prob.toFixed(2) }}</td>
    <td>N/A</td>
    <td>N/A</td>
  </template>
  <!-- Yes Bid -->
  <template v-else-if="entry.yesBid">
    <td>{{ entry.yesWeight.toFixed(2) }}</td>
    <td>{{ entry.prob.toFixed(2) }}</td>
    <td>{{ entry.yesPayout.toFixed(2) }}</td>
    <td>{{ (entry.yesReturn * 100).toFixed(2) }}%</td>
  </template>
  <!-- No Bid -->
  <template v-else-if="entry.noBid">
    <td>{{ entry.noWeight.toFixed(2) }}</td>
    <td>{{ entry.prob.toFixed(2) }}</td>
    <td>{{ entry.noPayout.toFixed(2) }}</td>
    <td>{{ (entry.noReturn * 100).toFixed(2) }}%</td>
  </template>
</template>

<script setup lang="ts">
import { PropType } from '@vue/runtime-core'
import { Entry } from './entries'

defineProps({
  entry: Object as PropType<Entry>,
})
</script>
