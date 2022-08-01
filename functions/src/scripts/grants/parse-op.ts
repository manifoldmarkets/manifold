// Run with `npx ts-node src/scripts/grants/parse-op.ts`

import * as fs from 'fs'

// Parse OpenPhil grants from csv file
async function parseOp() {
  const csv = fs.readFileSync('op-grants.csv', 'utf8')
  const lines = csv.split('\n')
  // Remove header row
  lines.shift()
  const grants = lines.map((line) => {
    const [grant, orgName, focusArea, amount, date] = line.split(',')
    // Return a json-formatted string like `{ from: 'OP', to: 'Manifold', amount: 1234 }`
    return `{ from: "OP", to: ${orgName}, date: ${date}, amount: ${amount}, description: ${grant}${focusArea} }`
  })
  fs.writeFileSync('output-grants.csv', grants.join('\n'))
}

if (require.main === module) {
  parseOp().then(() => process.exit())
}
