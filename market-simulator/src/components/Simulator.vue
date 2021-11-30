<template>
  <div class="overflow-x-auto px-12">
    <table class="table">
      <thead>
        <tr>
          <th>Order #</th>
          <th>Yes bid</th>
          <th>No Bid</th>
          <th>Implied Probability</th>
          <th>Payout</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(entry, i) in entries">
          <th>{{ i }}</th>
          <td>{{ entry.yesBid || '' }}</td>
          <td>{{ entry.noBid || '' }}</td>
          <td>{{ entry.prob }}</td>
          <td>{{ entry.payout }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { bids } from './orders'

const entries = bids.map((bid) => ({
  ...bid,
  prob: 0.646,
  payout: 1.23,
}))
</script>
