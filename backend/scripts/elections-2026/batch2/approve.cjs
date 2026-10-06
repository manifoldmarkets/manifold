// Approves the batch 2 manifest after Tod has reviewed it. Run from backend/scripts:
//   node elections-2026/batch2/approve.cjs
// Changes only review.approved/reviewedBy/reviewedAt/notes, byte-surgically.
const fs = require('fs')
const path = require('path')
const assert = require('assert')

require(require.resolve('ts-node', { paths: [process.cwd()] })).register({ transpileOnly: true })
const { patchJson } = require(path.resolve('elections-2026/market-seeds.ts'))

const file = path.resolve('elections-2026/batch2/manifest.json')
const now = new Date().toISOString()
const before = fs.readFileSync(file, 'utf8')
const json = JSON.parse(before)
const edits = [
  { keys: ['review', 'approved'], value: true },
  { keys: ['review', 'reviewedBy'], value: 'Tod' },
  { keys: ['review', 'reviewedAt'], value: now },
  { keys: ['review', 'notes'], value: `${json.review.notes}\n${now}: Approved for creation.` },
]
const expected = JSON.parse(before)
Object.assign(expected.review, { approved: true, reviewedBy: 'Tod', reviewedAt: now, notes: edits[3].value })
const after = patchJson(before, edits)
assert.deepStrictEqual(JSON.parse(after), expected)
fs.writeFileSync(file, after)
console.log(`approved ${json.entries.length} entries, budget ${json.budget.approvedMaxTotalMana}`)
