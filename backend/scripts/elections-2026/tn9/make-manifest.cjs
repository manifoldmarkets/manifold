// TN-9 alone, taken from the batch 2 manifest (same series and race key, so the
// same reserved id: running batch 2 later skips it). The other batch 2 districts
// (AL-2, CO-4, NC-9) now get party odds from their candidate markets, and VA-1
// already has odds, so TN-9 is the only one still without a market.
// Run from backend/scripts:  node elections-2026/tn9/make-manifest.cjs
const fs = require('fs')
const path = require('path')

const batch2 = JSON.parse(fs.readFileSync(path.resolve('elections-2026/batch2/manifest.json'), 'utf8'))
const entries = batch2.entries.filter((e) => e.dashboard?.key === 'TN-9')
if (entries.length !== 1 || entries[0].status !== 'ready') throw new Error('TN-9 entry not found or not ready')
const manifest = {
  ...batch2,
  generatedAt: new Date().toISOString(),
  review: {
    approved: false,
    notes:
      "TN-9 only (2026-10-07), from batch 2's reviewed entry and its 2026-10-06 seeds: the one House district with no market at all. Needs Tod's approval before creation.",
  },
  budget: { approvedMaxTotalMana: 1000 },
  entries,
}
const out = path.resolve('elections-2026/tn9/manifest.json')
fs.writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n')
console.log(`wrote ${out}: ${entries.map((e) => e.raceKey).join(', ')}`)
