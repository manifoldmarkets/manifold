// Midterm conditional pairs: "If Democrats win the House/Senate in 2026, will X?" and
// "If Republicans keep it, will X?". Each resolves N/A if its condition fails, so the
// gap between a pair is the market's estimate of what control changes.
// Seeds anchor on public prediction-market prices where one exists (Trump impeached
// in his second term ~62%, so ~68% with a Democratic House and ~2% without; 0 Supreme
// Court confirmations this term ~35%; 2+ shutdowns in 2026 ~65%); the rest are priors.
// Dry run by default (prints payloads). With --apply, creates as the API key's user
// (@ManifoldPolitics), idempotently: each market has a reserved id, checked first.
// Run from backend/scripts:
//   node elections-2026/conditionals/create-conditionals.cjs            # dry run
//   MANIFOLD_API_KEY=... node elections-2026/conditionals/create-conditionals.cjs --apply
const path = require('path')

require(require.resolve('ts-node', { paths: [process.cwd()] })).register({ transpileOnly: true })
const { idempotencyKeyFor } = require(path.resolve('../shared/src/elections/election-market-creation.ts'))

const API = 'https://api.manifold.markets'
const SERIES = 'us-2026-conditionals-v1'
const APPLY = process.argv.includes('--apply')
// us-politics, 2026 US congressional elections, elections, 2026 midterms (as the launch markets).
const GROUP_IDS = ['2e9fc841-389f-4e11-99bb-c26ca54ecac2', 'AjxQR8JMpNyDqtiqoA96', 'i5JOzjrK5ZMHPSkhgzoi', '1f785ecd-2cbc-4a04-8c20-0459dc31e4ad']
const utc = (s) => Date.parse(s)

const CONDITIONS = {
  'house-D': {
    short: 'Democrats win the House',
    text: '**Condition:** Democrats win a majority of seats in the U.S. House of Representatives in the November 3, 2026 elections (at least 218 seats won by Democratic Party candidates, counting delegations as certified; independents count for neither party). If Republicans or no party win a majority, this market resolves **N/A**.',
  },
  'house-R': {
    short: 'Republicans keep the House',
    text: '**Condition:** Republicans win a majority of seats in the U.S. House of Representatives in the November 3, 2026 elections (at least 218 seats won by Republican Party candidates, counting delegations as certified; independents count for neither party). If Democrats or no party win a majority, this market resolves **N/A**.',
  },
  'senate-D': {
    short: 'Democrats win the Senate',
    text: '**Condition:** Democrats control the U.S. Senate when the 120th Congress convenes on January 3, 2027: Democratic senators plus independents who caucus with them hold at least 51 seats (a 50–50 Senate is Republican control because the Vice President is a Republican). Otherwise this market resolves **N/A**.',
  },
  'senate-R': {
    short: 'Republicans keep the Senate',
    text: '**Condition:** Republicans control the U.S. Senate when the 120th Congress convenes on January 3, 2027: Republican senators hold at least 50 seats (with the Republican Vice President breaking ties). Otherwise this market resolves **N/A**.',
  },
}

const QUESTIONS = [
  {
    key: 'impeach',
    chamber: 'house',
    ask: 'will the House impeach Donald Trump before January 3, 2029?',
    seeds: { D: 68, R: 2 },
    close: '2029-01-03T17:00:00Z',
    rule: 'Resolves **YES** if the U.S. House adopts at least one article of impeachment against Donald Trump between January 3, 2027 and January 3, 2029 (inclusive). Resolves **NO** otherwise.',
  },
  {
    key: 'shutdown',
    chamber: 'house',
    ask: 'will there be a federal government shutdown in 2027?',
    seeds: { D: 55, R: 30 },
    close: '2027-12-31T23:59:00Z',
    rule: 'Resolves **YES** if a lapse in federal appropriations causes a shutdown (agencies begin orderly shutdown procedures and furlough non-excepted employees) that starts at any time during calendar year 2027 (U.S. Eastern time), whether full or partial. A lapse that starts in 2026 and continues into 2027 does not count; one starting in 2027 counts even if brief. Resolves **NO** otherwise.',
  },
  {
    key: 'sp500',
    chamber: 'house',
    ask: 'will the S&P 500 close 2027 higher than it closed on November 3, 2026?',
    seeds: { D: 68, R: 70 },
    close: '2027-12-31T21:00:00Z',
    rule: "Resolves **YES** if the S&P 500 index's official closing level on its last trading day of 2027 is higher than its official closing level on November 3, 2026 (Election Day). Resolves **NO** if it is equal or lower. Uses S&P Dow Jones Indices' published closes.",
  },
  {
    key: 'scotus',
    chamber: 'senate',
    ask: 'will the Senate confirm a new Supreme Court justice before January 3, 2029?',
    seeds: { D: 15, R: 55 },
    close: '2029-01-03T17:00:00Z',
    rule: 'Resolves **YES** if the U.S. Senate votes to confirm a nominee to the Supreme Court of the United States between January 3, 2027 and January 3, 2029 (inclusive), for any seat including Chief Justice. Resolves **NO** otherwise.',
  },
]

function payloads() {
  const out = []
  for (const q of QUESTIONS)
    for (const side of ['D', 'R']) {
      const cond = CONDITIONS[`${q.chamber}-${side}`]
      const raceKey = `2026-conditional-${q.key}-${q.chamber}-${side}`
      const question = `If ${cond.short} in 2026, ${q.ask}`
      const pair = CONDITIONS[`${q.chamber}-${side === 'D' ? 'R' : 'D'}`].short
      out.push({
        raceKey,
        idempotencyKey: idempotencyKeyFor(SERIES, raceKey),
        body: {
          question,
          descriptionMarkdown: [
            cond.text,
            '',
            q.rule,
            '',
            `This is one half of a conditional pair; its twin asks the same question if ${pair}. Comparing the two shows what the market thinks control of the ${q.chamber === 'house' ? 'House' : 'Senate'} changes.`,
            '',
            'Starting probability is a seed, not a forecast: anchored on public prediction-market prices where a related market exists, otherwise a prior.',
          ].join('\n'),
          outcomeType: 'BINARY',
          initialProb: q.seeds[side],
          closeTime: utc(q.close),
          liquidityTier: 1000,
          groupIds: GROUP_IDS,
          visibility: 'public',
        },
      })
    }
  return out
}

;(async () => {
  const markets = payloads()
  if (!APPLY) {
    for (const m of markets) console.log(`${m.idempotencyKey}  ${m.body.initialProb}%  ${m.body.question}  (closes ${new Date(m.body.closeTime).toISOString().slice(0, 10)})`)
    console.log(`\n${markets.length} markets, Ṁ${markets.length * 1000}. Dry run only; add --apply to create.`)
    return
  }
  const key = process.env.MANIFOLD_API_KEY
  if (!key) throw new Error('MANIFOLD_API_KEY is required with --apply')
  for (const m of markets) {
    const existing = await fetch(`${API}/v0/market/${m.idempotencyKey}`)
    if (existing.ok) {
      const c = await existing.json()
      console.log(`exists  ${c.url}`)
      continue
    }
    const res = await fetch(`${API}/v0/market`, {
      method: 'POST',
      headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...m.body, idempotencyKey: m.idempotencyKey }),
    })
    const text = await res.text()
    if (!res.ok) throw new Error(`${m.raceKey}: HTTP ${res.status} ${text.slice(0, 300)}`)
    const c = JSON.parse(text)
    await new Promise((r) => setTimeout(r, 1500))
    const check = await (await fetch(`${API}/v0/market/${c.id}`)).json()
    const ok = Math.abs(check.probability * 100 - m.body.initialProb) < 1
    console.log(`${ok ? 'created' : 'CHECK SEED'}  ${(check.probability * 100).toFixed(1)}%  ${c.url}`)
    await new Promise((r) => setTimeout(r, 1000))
  }
})().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
