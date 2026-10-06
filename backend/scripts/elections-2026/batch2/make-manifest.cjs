// Batch 2 of the 2026 House launch: party markets for the five districts the
// election map still lacked party odds for on 2026-10-06 (candidate-only AL-2,
// CO-4, NC-9; unpriced TN-9; VA-1 priced only by an answer in a Democratic-win
// district portfolio). Reviewed duplicate-search hits: CO-4 my1pTAxoM6NKGoMyDIyX "Lauren Boebert (Permanent)", TN-9
// 9pNhdgpgzz (a primary-era candidate market whose R nominee sits under Other), VA-1 8ZNNtUnZAp (a seat-count market).
// Clones the launched AL-01 entry, fills each district's
// ballot nominees, and seeds from live public prediction-market prices.
// Read-only network: public, unauthenticated market-data GETs. Writes manifest.json.
// Run from backend/scripts:  node elections-2026/batch2/make-manifest.cjs
const fs = require('fs')
const path = require('path')

require(require.resolve('ts-node', { paths: [process.cwd()] })).register({ transpileOnly: true })
const { compactMarket, usableQuote, normalizeSeeds } = require(path.resolve('elections-2026/market-seeds.ts'))

const API = 'https://api.elections.kalshi.com/trade-api/v2'
const DIR = path.resolve('elections-2026/batch2')
const LAUNCHED = JSON.parse(fs.readFileSync(path.resolve('elections-2026/manifest.json'), 'utf8'))
const CANDIDATES = JSON.parse(
  fs.readFileSync(path.resolve('../../web/public/data/election-candidates-2026.json'), 'utf8')
).house
const TEMPLATE = LAUNCHED.entries.find((e) => e.raceKey === '2026-house-AL-01-regular-general')

const RACES = [
  { st: 'AL', name: 'Alabama', n: 2, event: 'KXHOUSERACE-AL02-26', rejected: ['2gnh0c6NqI'], why: 'only a candidate binary (Shomari Figures) priced this race, so the election map showed no party odds' },
  { st: 'CO', name: 'Colorado', n: 4, event: 'KXHOUSERACE-CO04-26', rejected: ['5EIC9A05cU', 'my1pTAxoM6NKGoMyDIyX'], why: 'only a candidate binary (Lauren Boebert) priced this race, so the election map showed no party odds' },
  { st: 'NC', name: 'North Carolina', n: 9, event: 'KXHOUSERACE-NC09-26', rejected: ['RZSnU2csSI'], why: 'only a candidate binary (Richard Ojeda) priced this race, so the election map showed no party odds' },
  { st: 'TN', name: 'Tennessee', n: 9, event: 'KXHOUSERACE-TN09-26', rejected: ['9pNhdgpgzz'], why: 'no market priced this race, so the election map left it unpriced' },
  { st: 'VA', name: 'Virginia', n: 1, event: 'HOUSEVA1-26', rejected: ['8ZNNtUnZAp'], why: 'only an answer in a Democratic-win district portfolio priced this race; it is a toss-up and gets its own party market' },
]

const ord = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th')
const pad = (n) => String(n).padStart(2, '0')
const PARTY = { D: 'Democratic', R: 'Republican', I: 'Independent', L: 'Libertarian', G: 'Green', other: 'Other', unknown: 'Unknown' }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function seedFor(race, dem, rep) {
  const r = await fetch(`${API}/events/${race.event}?with_nested_markets=true`)
  if (!r.ok) throw new Error(`${race.event}: HTTP ${r.status}`)
  const j = await r.json()
  const fetchedAt = new Date().toISOString()
  const markets = (j.event?.markets ?? j.markets ?? []).map((m) => compactMarket(m, fetchedAt))
  const side = (m) =>
    m.yesSubtitle === dem.name || /-D$/.test(m.ticker) ? 0 : m.yesSubtitle === rep.name || /-R$/.test(m.ticker) ? 1 : 2
  const weights = [0, 0, 0]
  const quotes = []
  for (const m of markets) {
    const q = usableQuote(m)
    if (q.price === undefined) throw new Error(`${m.ticker}: ${q.reason}`)
    weights[side(m)] += q.price
    quotes.push({ ticker: m.ticker, answer: side(m), price: q.price, yesBid: m.yesBid, yesAsk: m.yesAsk, lastPrice: m.lastPrice, volume: m.volume, volume24h: m.volume24h, openInterest: m.openInterest, fetchedAt })
  }
  if (!weights[0] || !weights[1]) throw new Error(`${race.event}: missing a major-party quote`)
  return { seeds: normalizeSeeds(weights), quotes, fetchedAt }
}

;(async () => {
  const entries = []
  for (const race of RACES) {
    await sleep(400)
    const id = `${race.st}-${race.n}`
    const ballot = CANDIDATES[id]
    const dem = ballot.filter((c) => c.party === 'D')
    const rep = ballot.filter((c) => c.party === 'R')
    if (dem.length !== 1 || rep.length !== 1) throw new Error(`${id}: expected one D and one R nominee`)
    const { seeds, quotes, fetchedAt } = await seedFor(race, dem[0], rep[0])
    const favourite = Math.max(...seeds)
    const tier = favourite < 85 ? 10000 : 1000
    const districtText = `${race.name}'s ${ord(race.n)} congressional district`
    const listed = [...ballot].sort((a, b) => ['R', 'D'].indexOf(b.party) - ['R', 'D'].indexOf(a.party))
    const description = TEMPLATE.payload.descriptionMarkdown
      .replace("Alabama's 1st congressional district", districtText)
      .replace(/\n- Jerry Carl — Republican\n- Clyde Jones Jr\. — Democratic\n/, '\n' + listed.map((c) => `- ${c.name} — ${PARTY[c.party]}`).join('\n') + '\n')
      .replace(
        "Starting probabilities are seeds set mechanically from the district's partisan lean, not forecasts.",
        'Starting probabilities were seeded from public prediction-market prices in October 2026; they are not forecasts.'
      )
    if (description.includes('Alabama\'s 1st') || description.includes('Jerry Carl')) throw new Error(`${id}: template text left over`)
    const answers = [`Democratic Party — ${dem[0].name}`, `Republican Party — ${rep[0].name}`, 'Another party or independent']
    entries.push({
      ...TEMPLATE,
      raceKey: `2026-house-${race.st}-${pad(race.n)}-regular-general`,
      status: 'ready',
      identity: { ...TEMPLATE.identity, state: race.st, stateName: race.name, district: race.n, candidateNames: listed.map((c) => c.name) },
      payload: {
        ...TEMPLATE.payload,
        question: `Which party will win the 2026 U.S. House election in ${race.name}'s ${ord(race.n)} District?`,
        descriptionMarkdown: description,
        answers,
        answerProbs: seeds,
        liquidityTier: tier,
      },
      answerMeta: [
        { label: answers[0], kind: 'party', party: 'D', candidate: dem[0].name },
        { label: answers[1], kind: 'party', party: 'R', candidate: rep[0].name },
        { label: answers[2], kind: 'other', party: 'other' },
      ],
      seed: {
        basis: `Public market order-book seed fetched ${fetchedAt}; usable outcome midpoints normalized; 1% floor; largest answer receives rounding remainder. ${quotes.map((q) => q.ticker).join(', ')}. Seed, not a guaranteed forecast; source settlement criteria may differ.`,
        note: 'Initial pool probabilities only. Not an observed market forecast.',
        source: { kind: 'market-price', apiBase: API, tickers: quotes.map((q) => q.ticker), fetchedAt, quotes },
      },
      liquidityPlan: {
        ...TEMPLATE.liquidityPlan,
        tier,
        rationale:
          tier === 10000
            ? `Competitive by market price (favourite ${favourite}% < 85%): tier 10,000 so a Ṁ100 trade moves the price by roughly a point, not ten.`
            : `Safe by market price (favourite ${favourite}% ≥ 85%): tier 1,000 (minimum recommended).`,
      },
      reviewedRejectedContractIds: race.rejected,
      searchTerms: [`${race.name} ${ord(race.n)} district 2026`, `${race.st}-${race.n}`, `${race.st}${pad(race.n)}`, `${race.name} House 2026`, `${race.name} congressional`],
      dashboard: { list: 'HOUSE_RACE_MARKETS', key: id },
      evidence: {
        whyCreate: race.why,
        snapshot: 'prod /election map audit 2026-10-06 (read-only)',
        inventorySource: 'web/public/data/election-candidates-2026.json (audited ballot candidates)',
        rejectedAlternatives: race.rejected,
      },
    })
    console.log(`${id}: ${JSON.stringify(seeds)} tier ${tier} (${quotes.map((q) => `${q.ticker} ${q.yesBid}/${q.yesAsk}`).join(', ')})`)
  }
  const { entries: _, ...header } = LAUNCHED
  const budget = entries.reduce((s, e) => s + e.payload.liquidityTier, 0)
  const manifest = {
    ...header,
    manifestVersion: '2026-10-06.batch2',
    generatedAt: new Date().toISOString(),
    review: {
      approved: false,
      notes: 'Batch 2 (2026-10-06): party markets for AL-2, CO-4, NC-9, TN-9 and VA-1, which still lacked party odds on the election map. Seeds from public prediction-market prices; tier 10,000 where the favourite is below 85%. Needs Tod\'s approval before creation.',
    },
    budget: { ...header.budget, approvedMaxTotalMana: budget },
    entries,
  }
  fs.mkdirSync(DIR, { recursive: true })
  fs.writeFileSync(path.join(DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  console.log(`wrote ${entries.length} entries, budget ${budget}`)
})().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
