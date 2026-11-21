import { runScript } from 'run-script'

// Example prize structure for a sweepstakes
const EXAMPLE_PRIZES = [
  { rank: 1, amountUsdc: 1000, label: '1st' },
  { rank: 2, amountUsdc: 500, label: '2nd' },
  { rank: 3, amountUsdc: 250, label: '3rd' },
  { rankStart: 4, rankEnd: 10, amountUsdc: 50, label: '4th-10th' },
]

runScript(async ({ pg }) => {
  const sweepstakesNum = parseInt(process.argv[2])
  const name = process.argv[3]
  const closeTimeStr = process.argv[4]

  if (!sweepstakesNum || !name || !closeTimeStr) {
    console.log('Usage: ts-node init-sweepstakes.ts <sweepstakesNum> <name> <closeTime>')
    console.log('Example: ts-node init-sweepstakes.ts 1 "Weekly Sweepstakes #1" "2026-02-01T00:00:00Z"')
    console.log('\nThis will create a sweepstakes with the following prize structure:')
    console.log(JSON.stringify(EXAMPLE_PRIZES, null, 2))
    return
  }

  const closeTime = new Date(closeTimeStr)
  if (isNaN(closeTime.getTime())) {
    console.error('Invalid close time. Please use ISO format: YYYY-MM-DDTHH:mm:ssZ')
    return
  }

  // Check if sweepstakes already exists
  const existing = await pg.oneOrNone(
    'SELECT sweepstakes_num FROM sweepstakes WHERE sweepstakes_num = $1',
    [sweepstakesNum]
  )

  if (existing) {
    console.error(`Sweepstakes #${sweepstakesNum} already exists!`)
    return
  }

  // Create the sweepstakes
  const result = await pg.one<{ sweepstakes_num: number; nonce: string }>(
    `INSERT INTO sweepstakes (sweepstakes_num, name, prizes, close_time)
     VALUES ($1, $2, $3, $4)
     RETURNING sweepstakes_num, nonce`,
    [sweepstakesNum, name, JSON.stringify(EXAMPLE_PRIZES), closeTime.toISOString()]
  )

  console.log(`Created sweepstakes #${result.sweepstakes_num}`)
  console.log(`Name: ${name}`)
  console.log(`Close time: ${closeTime.toISOString()}`)
  console.log(`Nonce (keep secret until drawing): ${result.nonce}`)
  console.log(`\nPrize structure:`)
  console.log(JSON.stringify(EXAMPLE_PRIZES, null, 2))

  // Calculate MD5 hash for provably fair display
  const crypto = await import('crypto')
  const nonceHash = crypto.createHash('md5').update(result.nonce).digest('hex')
  console.log(`\nNonce hash (MD5) for provably fair: ${nonceHash}`)
})
