// Batch 3 of the 2026 House launch: party markets for the 182 districts the election
// map priced only through answers in thin "which districts will Democrats win" sets
// (e.g. NY-14 showed 82% D from an 8-trader set). Inputs, computed on 2026-10-06 from
// main's page data and a scan of open public prediction-market events:
//   districts.json  districts with no party market (not in HOUSE_RACE_MARKETS, not
//                   decided by ballot, not in batch 2)
//   events.json     district -> its "XX-NN House winner?" reference event
// Clones the launched AL-01 entry, fills each district's audited ballot nominees, seeds
// from live public quotes (same rules as market-seeds.ts), tier 10,000 where the
// favourite is below 85%, else 1,000. Districts without usable quotes are skipped and
// listed. Read-only network. Writes manifest.json and skipped.json.
// Run from backend/scripts:  node elections-2026/batch3/make-manifest.cjs
const fs = require('fs')
const path = require('path')

require(require.resolve('ts-node', { paths: [process.cwd()] })).register({ transpileOnly: true })
const { compactMarket, usableQuote, normalizeSeeds } = require(path.resolve('elections-2026/market-seeds.ts'))

const API = 'https://api.elections.kalshi.com/trade-api/v2'
const DIR = path.resolve('elections-2026/batch3')
const LAUNCHED = JSON.parse(fs.readFileSync(path.resolve('elections-2026/manifest.json'), 'utf8'))
const CANDIDATES = JSON.parse(
  fs.readFileSync(path.resolve('../../web/public/data/election-candidates-2026.json'), 'utf8')
).house
const DISTRICTS = JSON.parse(fs.readFileSync(path.join(DIR, 'districts.json'), 'utf8'))
const EVENTS = JSON.parse(fs.readFileSync(path.join(DIR, 'events.json'), 'utf8'))
// Duplicate-search hits from the 2026-10-06 online dry run, reviewed: state-legislative
// districts with the same number (incl. a CA-38 State Senate market the search called
// equivalent), candidate markets for the same seats, statewide seat-count/derivative
// markets, and two party binaries (ME-2, TX-15) kept alongside these deeper markets.
const REVIEWED = JSON.parse(fs.readFileSync(path.join(DIR, 'reviewed-rejections.json'), 'utf8'))
const TEMPLATE = LAUNCHED.entries.find((e) => e.raceKey === '2026-house-AL-01-regular-general')

// The district sets these markets replace on the map. They name every district, so the
// duplicate search would hold each race as ambiguous; they are different questions.
const PORTFOLIOS = {
  sqUzOZN8Cs: 'will-a-democrat-win-these-us-house',
  SRynqNSuEL: 'which-texas-us-house-districts-will',
  NZuO50NCLg: 'which-texas-house-districts-will-th',
  '9nS9P2scql': 'which-new-york-house-districts-will',
  cN025dzLdO: 'which-florida-house-districts-will',
  USqLR8OSCI: 'which-california-house-districts-wi',
  ps6uhP6ttd: 'which-nevada-us-house-seats-will-de',
  Qzqdd2ptO6: 'which-iowa-congressional-districts',
  s2uNNQ2N5I: 'which-us-house-districts-in-the-mid',
}
const STATES = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming' }
const ord = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th')
const pad = (n) => String(n).padStart(2, '0')
const PARTY = { D: 'Democratic', R: 'Republican', I: 'Independent', L: 'Libertarian', G: 'Green', other: 'Other', unknown: 'Unknown' }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Quotes for one district: answers are [D, R, Other] or, with no Republican nominee, [D, Other].
async function seedFor(event, answers) {
  const r = await fetch(`${API}/events/${event}?with_nested_markets=true`)
  if (!r.ok) throw new Error(`${event}: HTTP ${r.status}`)
  const j = await r.json()
  const fetchedAt = new Date().toISOString()
  const markets = (j.event?.markets ?? j.markets ?? []).map((m) => compactMarket(m, fetchedAt))
  const index = (m) => {
    const party = /-D$/.test(m.ticker) ? 'D' : /-R$/.test(m.ticker) ? 'R' : 'other'
    const i = answers.findIndex((a) => a.party === party)
    return i >= 0 ? i : answers.findIndex((a) => a.party === 'other')
  }
  const weights = answers.map(() => 0)
  const quotes = []
  for (const m of markets) {
    const q = usableQuote(m)
    if (q.price === undefined) throw new Error(`${m.ticker}: ${q.reason}`)
    weights[index(m)] += q.price
    quotes.push({ ticker: m.ticker, answer: index(m), price: q.price, yesBid: m.yesBid, yesAsk: m.yesAsk, lastPrice: m.lastPrice, volume: m.volume, volume24h: m.volume24h, openInterest: m.openInterest, fetchedAt })
  }
  answers.forEach((a, i) => {
    if (a.party !== 'other' && !weights[i]) throw new Error(`${event}: no usable ${a.party} quote`)
  })
  return { seeds: normalizeSeeds(weights), quotes, fetchedAt }
}

;(async () => {
  const entries = []
  const skipped = []
  for (const id of DISTRICTS) {
    await sleep(350)
    const [st, num] = id.split('-')
    const n = Number(num)
    const name = STATES[st]
    try {
      const ballot = CANDIDATES[id]
      const dem = ballot.filter((c) => c.party === 'D')
      const rep = ballot.filter((c) => c.party === 'R')
      if (dem.length > 1 || rep.length > 1) throw new Error('more than one nominee for a major party')
      if (!dem.length && !rep.length) throw new Error('no major-party nominee')
      const meta = [
        ...(dem.length ? [{ label: `Democratic Party — ${dem[0].name}`, kind: 'party', party: 'D', candidate: dem[0].name }] : []),
        ...(rep.length ? [{ label: `Republican Party — ${rep[0].name}`, kind: 'party', party: 'R', candidate: rep[0].name }] : []),
        { label: 'Another party or independent', kind: 'other', party: 'other' },
      ]
      const { seeds, quotes, fetchedAt } = await seedFor(EVENTS[id], meta)
      const favourite = Math.max(...seeds)
      const tier = favourite < 85 ? 10000 : 1000
      const atLarge = n === 0
      const districtText = atLarge ? `${name}'s at-large congressional district` : `${name}'s ${ord(n)} congressional district`
      const listed = [...ballot].sort((a, b) => ['R', 'D'].indexOf(b.party) - ['R', 'D'].indexOf(a.party))
      const description = TEMPLATE.payload.descriptionMarkdown
        .replace("Alabama's 1st congressional district", districtText)
        .replace(/\n- Jerry Carl — Republican\n- Clyde Jones Jr\. — Democratic\n/, '\n' + listed.map((c) => `- ${c.name} — ${PARTY[c.party]}`).join('\n') + '\n')
        .replace(
          "Starting probabilities are seeds set mechanically from the district's partisan lean, not forecasts.",
          'Starting probabilities were seeded from public prediction-market prices in October 2026; they are not forecasts.'
        )
      if (description.includes("Alabama's 1st") || description.includes('Jerry Carl')) throw new Error('template text left over')
      const question = atLarge
        ? `Which party will win the 2026 U.S. House election in ${name}'s at-large District?`
        : `Which party will win the 2026 U.S. House election in ${name}'s ${ord(n)} District?`
      const raceKey = `2026-house-${st}-${pad(n)}-regular-general`
      const portfolio = [...Object.keys(PORTFOLIOS), ...(REVIEWED[raceKey] ?? [])]
      entries.push({
        ...TEMPLATE,
        raceKey,
        status: 'ready',
        identity: { ...TEMPLATE.identity, state: st, stateName: name, district: n, candidateNames: listed.map((c) => c.name) },
        proposition: 'ballot-party',
        shapeRationale: TEMPLATE.shapeRationale.replace(
          'Democratic Party / Republican Party / Another party or independent',
          meta.map((m) => m.label.split(' — ')[0]).join(' / ')
        ),
        payload: { ...TEMPLATE.payload, question, descriptionMarkdown: description, answers: meta.map((m) => m.label), answerProbs: seeds, liquidityTier: tier },
        answerMeta: meta,
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
        reviewedRejectedContractIds: portfolio,
        searchTerms: [`${name} ${atLarge ? 'at-large' : ord(n)} district 2026`, `${st}-${atLarge ? 'AL' : n}`, `${st}${pad(n)}`, `${name} House 2026`, `${name} congressional`],
        dashboard: { list: 'HOUSE_RACE_MARKETS', key: id },
        evidence: {
          whyCreate: 'the election map priced this race only through an answer in a thinly traded "which districts will Democrats win" set',
          snapshot: 'prod /election map audit 2026-10-06 (read-only)',
          inventorySource: 'web/public/data/election-candidates-2026.json (audited ballot candidates)',
          rejectedAlternatives: portfolio,
        },
      })
      console.log(`${id}: ${JSON.stringify(seeds)} tier ${tier}`)
    } catch (e) {
      skipped.push({ id, reason: e.message })
      console.log(`${id}: SKIPPED ${e.message}`)
    }
  }
  const { entries: _, ...header } = LAUNCHED
  const budget = entries.reduce((s, e) => s + e.payload.liquidityTier, 0)
  const manifest = {
    ...header,
    manifestVersion: '2026-10-06.batch3',
    generatedAt: new Date().toISOString(),
    review: {
      approved: false,
      notes: `Batch 3 (2026-10-06): party markets for ${entries.length} districts the election map priced only through thin district sets. Seeds from public prediction-market prices; tier 10,000 where the favourite is below 85%. Needs Tod's approval before creation.`,
    },
    budget: { ...header.budget, approvedMaxTotalMana: budget },
    entries,
  }
  fs.writeFileSync(path.join(DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  fs.writeFileSync(path.join(DIR, 'skipped.json'), JSON.stringify(skipped, null, 2) + '\n')
  const tiers = entries.reduce((m, e) => ((m[e.payload.liquidityTier] = (m[e.payload.liquidityTier] ?? 0) + 1), m), {})
  console.log(`wrote ${entries.length} entries (tiers ${JSON.stringify(tiers)}), budget ${budget}; skipped ${skipped.length}`)
})().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
