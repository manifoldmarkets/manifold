// Conditional pairs for the elections page: "If Democrats win the House/Senate in 2026,
// will X?" / "If Republicans keep it, will X?", and for 2028 "If the Democratic /
// Republican nominee wins the presidency, will X?". Each resolves N/A if its condition
// fails, so the gap between a pair is the market's estimate of what control changes.
// Seeds anchor on public prediction-market prices where one exists (Trump impeached
// in his second term ~62%, so ~68% with a Democratic House and ~2% without; 0 Supreme
// Court confirmations this term ~35%; 2+ shutdowns in 2026 ~65%); the rest are priors.
// New questions go at the end: the reserved id hashes the race key, not the position.
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
// 2028 US presidential election, us-politics, elections.
const PRES_GROUP_IDS = ['c83fd20c-226d-4b9e-ad21-b116412d4009', 'AjxQR8JMpNyDqtiqoA96', 'i5JOzjrK5ZMHPSkhgzoi']
const TOPIC = {
  economics: 'p88Ycq6yFd5ECKqq9PFO',
  usEconomy: '36d1e8d5-2e36-481d-b3e0-42e53c37ecbb',
  stocks: 'QDQfgsFiQrNNlZhsRGf5',
  bitcoin: 'WBeBD6FyMd0NvSL0qjMb',
}
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
  'pres-D': {
    short: 'the Democratic nominee wins the 2028 presidential election',
    text: "**Condition:** the Democratic Party's 2028 presidential nominee wins the 2028 presidential election, as determined by Congress's count of electoral votes in January 2029 (or, if no one has a majority, the House's choice). If anyone else wins, this market resolves **N/A**.",
  },
  'pres-R': {
    short: 'the Republican nominee wins the 2028 presidential election',
    text: "**Condition:** the Republican Party's 2028 presidential nominee wins the 2028 presidential election, as determined by Congress's count of electoral votes in January 2029 (or, if no one has a majority, the House's choice). If anyone else wins, this market resolves **N/A**.",
  },
}
const WHAT_CHANGES = { house: 'control of the House', senate: 'control of the Senate', pres: 'the 2028 presidential winner' }

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
  // ---- 2026 matrix rows (House control) ----
  {
    key: 'cabinet-impeach',
    chamber: 'house',
    ask: 'will the House impeach a Cabinet member before January 3, 2029?',
    seeds: { D: 70, R: 4 },
    close: '2029-01-03T17:00:00Z',
    rule: 'Resolves **YES** if the U.S. House adopts at least one article of impeachment against a sitting or former Cabinet-level official (the Vice President, the head of an executive department, or another official with Cabinet rank) between January 3, 2027 and January 3, 2029 (inclusive). Impeaching the President does not count. Resolves **NO** otherwise.',
  },
  {
    key: 'vetoes-2027',
    chamber: 'house',
    ask: 'will Trump veto at least 5 bills in 2027?',
    seeds: { D: 35, R: 5 },
    close: '2027-12-31T23:59:00Z',
    rule: "Resolves **YES** if Donald Trump vetoes five or more bills or joint resolutions during calendar year 2027, counting regular and pocket vetoes as listed in the U.S. Senate's record of presidential vetoes. Resolves **NO** otherwise.",
  },
  {
    key: 'approval-40',
    chamber: 'house',
    ask: "will Trump's approval rating be 40% or higher on January 1, 2028?",
    seeds: { D: 27, R: 25 },
    close: '2028-01-02T17:00:00Z',
    rule: "Resolves **YES** if VoteHub's polling average of Donald Trump's job approval is 40.0% or higher for January 1, 2028 (the value VoteHub shows for that date). If VoteHub's average is unavailable, uses the RealClearPolling average instead. Resolves **NO** otherwise, and **N/A** if Trump is not President on that date.",
  },
  {
    key: 'tariff-law',
    chamber: 'house',
    ask: "will a law cutting or ending any of Trump's tariffs be enacted before January 3, 2029?",
    seeds: { D: 12, R: 6 },
    close: '2029-01-03T17:00:00Z',
    extraGroups: [TOPIC.economics, TOPIC.usEconomy],
    rule: 'Resolves **YES** if a bill or joint resolution becomes law (signed, or passed over a veto) before January 3, 2029 that terminates or reduces any tariff imposed by the Trump administration since January 20, 2025, or ends the emergency it rests on. Resolves **NO** otherwise.',
  },
  {
    key: 'stock-ban',
    chamber: 'house',
    ask: 'will Congress ban its members from trading individual stocks before January 3, 2029?',
    seeds: { D: 25, R: 15 },
    close: '2029-01-03T17:00:00Z',
    extraGroups: [TOPIC.stocks],
    rule: 'Resolves **YES** if a law is enacted before January 3, 2029 that prohibits members of Congress from buying or selling individual stocks (a requirement to divest or use a qualified blind trust counts), even if it takes effect later. A House or Senate rule alone does not count. Resolves **NO** otherwise.',
  },
  {
    key: 'gdp-2027',
    chamber: 'house',
    ask: 'will U.S. real GDP shrink in any quarter of 2027?',
    seeds: { D: 28, R: 28 },
    close: '2028-02-15T17:00:00Z',
    extraGroups: [TOPIC.economics, TOPIC.usEconomy],
    rule: "Resolves **YES** if the Bureau of Economic Analysis's advance estimate of real GDP growth (seasonally adjusted annual rate) is negative for any quarter of 2027. Uses each quarter's advance estimate as first published; later revisions don't count. Resolves once the Q4 2027 advance estimate is out.",
  },
  {
    key: 'btc-150k',
    chamber: 'house',
    ask: 'will Bitcoin be above $150,000 at the end of 2027?',
    seeds: { D: 18, R: 20 },
    close: '2027-12-31T23:59:00Z',
    extraGroups: [TOPIC.bitcoin],
    rule: "Resolves **YES** if Coinbase's BTC-USD price at 00:00 UTC on January 1, 2028 (the daily close for December 31, 2027) is above $150,000. Resolves **NO** otherwise.",
  },
  // ---- 2028 matrix rows (presidency) ----
  {
    key: 'sp500-2029',
    cycle: 2028,
    chamber: 'pres',
    ask: 'will the S&P 500 close 2029 higher than it closed on Election Day 2028?',
    seeds: { D: 68, R: 70 },
    close: '2029-12-31T21:00:00Z',
    extraGroups: [TOPIC.stocks, TOPIC.economics],
    rule: "Resolves **YES** if the S&P 500 index's official closing level on its last trading day of 2029 is higher than its official closing level on November 7, 2028 (Election Day). Resolves **NO** if it is equal or lower. Uses S&P Dow Jones Indices' published closes.",
  },
  {
    key: 'gdp-2029-30',
    cycle: 2028,
    chamber: 'pres',
    ask: 'will U.S. real GDP shrink in any quarter of 2029 or 2030?',
    seeds: { D: 40, R: 40 },
    close: '2031-02-15T17:00:00Z',
    extraGroups: [TOPIC.economics, TOPIC.usEconomy],
    rule: "Resolves **YES** if the Bureau of Economic Analysis's advance estimate of real GDP growth (seasonally adjusted annual rate) is negative for any quarter of 2029 or 2030. Uses each quarter's advance estimate as first published; later revisions don't count. Resolves once the Q4 2030 advance estimate is out.",
  },
  {
    key: 'scotus-size',
    cycle: 2028,
    chamber: 'pres',
    ask: 'will the Supreme Court have more than nine justices before January 20, 2033?',
    seeds: { D: 12, R: 2 },
    close: '2033-01-20T17:00:00Z',
    rule: 'Resolves **YES** if, at any time before January 20, 2033, more than nine justices are serving on the U.S. Supreme Court at once. Resolves **NO** otherwise.',
  },
  {
    key: 'marijuana',
    cycle: 2028,
    chamber: 'pres',
    ask: 'will marijuana be removed from federal drug schedules before January 20, 2033?',
    seeds: { D: 35, R: 15 },
    close: '2033-01-20T17:00:00Z',
    rule: 'Resolves **YES** if marijuana (cannabis) is fully descheduled, removed from every schedule of the federal Controlled Substances Act by law or final rule, with effect before January 20, 2033. Moving it to Schedule III or any other schedule does not count. Resolves **NO** otherwise.',
  },
  {
    key: 'filibuster',
    cycle: 2028,
    chamber: 'pres',
    ask: 'will the Senate end the legislative filibuster before January 3, 2031?',
    seeds: { D: 30, R: 12 },
    close: '2031-01-03T17:00:00Z',
    rule: 'Resolves **YES** if, before January 3, 2031, the Senate changes its rules or sets a precedent so that ordinary legislation (or a whole category of it, such as voting-rights bills) can pass with a simple majority instead of needing 60 votes for cloture. Existing exceptions (nominations, budget reconciliation) and one-off waivers for a single bill do not count. Resolves **NO** otherwise.',
  },
  {
    key: 'abortion-law',
    cycle: 2028,
    chamber: 'pres',
    ask: 'will a federal law protecting abortion rights nationwide be enacted before January 20, 2033?',
    seeds: { D: 15, R: 1 },
    close: '2033-01-20T17:00:00Z',
    rule: 'Resolves **YES** if a federal statute establishing a nationwide legal right to obtain an abortion (for example, codifying the protections of Roe v. Wade) is enacted before January 20, 2033. Resolves **NO** otherwise.',
  },
  {
    key: 'btc-250k',
    cycle: 2028,
    chamber: 'pres',
    ask: 'will Bitcoin be above $250,000 at the end of 2030?',
    seeds: { D: 22, R: 26 },
    close: '2030-12-31T23:59:00Z',
    extraGroups: [TOPIC.bitcoin],
    rule: "Resolves **YES** if Coinbase's BTC-USD price at 00:00 UTC on January 1, 2031 (the daily close for December 31, 2030) is above $250,000. Resolves **NO** otherwise.",
  },
  // ---- 2026 matrix rows (Senate control), with the scotus pair above ----
  // Priors as of 2026-10-07: 53 Article III judges confirmed through
  // 2026-09-01 (~32 a year); Thune says the votes to end the filibuster
  // aren't there.
  {
    key: 'scotus-leave',
    chamber: 'senate',
    ask: 'will a Supreme Court justice leave the Court before January 3, 2029?',
    seeds: { D: 12, R: 50 },
    close: '2029-01-03T17:00:00Z',
    rule: 'Resolves **YES** if any justice of the U.S. Supreme Court retires, resigns, dies or otherwise leaves the Court between January 3, 2027 and January 3, 2029 (inclusive). A retirement counts when it takes effect; an announced retirement that has not taken effect by January 3, 2029 does not count. Resolves **NO** otherwise.',
  },
  {
    key: 'judges-40',
    chamber: 'senate',
    ask: 'will the Senate confirm at least 40 federal judges in the 120th Congress?',
    seeds: { D: 8, R: 65 },
    close: '2029-01-03T17:00:00Z',
    rule: "Resolves **YES** if the U.S. Senate confirms 40 or more Article III judges (Supreme Court, courts of appeals, district courts and the Court of International Trade) between January 3, 2027 and January 3, 2029, as counted by the Federal Judicial Center's biographical directory or the Senate's record of confirmations. Resolves **NO** otherwise.",
  },
  {
    key: 'cabinet-nominee',
    chamber: 'senate',
    ask: 'will a Cabinet nomination be rejected or withdrawn before January 3, 2029?',
    seeds: { D: 40, R: 8 },
    close: '2029-01-03T17:00:00Z',
    rule: "Resolves **YES** if, between January 3, 2027 and January 3, 2029, the Senate votes down, or the President withdraws, a nomination formally sent to the Senate to head one of the 15 executive departments (e.g. Attorney General, Secretary of Defense). Names floated or announced but never formally sent to the Senate don't count. Resolves **NO** otherwise.",
  },
  {
    key: 'shutdown',
    chamber: 'senate',
    ask: 'will there be a federal government shutdown in 2027?',
    seeds: { D: 50, R: 35 },
    close: '2027-12-31T23:59:00Z',
    rule: 'Resolves **YES** if a lapse in federal appropriations causes a shutdown (agencies begin orderly shutdown procedures and furlough non-excepted employees) that starts at any time during calendar year 2027 (U.S. Eastern time), whether full or partial. A lapse that starts in 2026 and continues into 2027 does not count; one starting in 2027 counts even if brief. Resolves **NO** otherwise.',
  },
  {
    key: 'filibuster',
    chamber: 'senate',
    ask: 'will the Senate end the legislative filibuster before January 3, 2029?',
    seeds: { D: 2, R: 8 },
    close: '2029-01-03T17:00:00Z',
    rule: 'Resolves **YES** if, before January 3, 2029, the Senate changes its rules or sets a precedent so that ordinary legislation (or a whole category of it) can pass with a simple majority instead of needing 60 votes for cloture. Existing exceptions (nominations, budget reconciliation) and one-off waivers for a single bill do not count. Resolves **NO** otherwise.',
  },
]

function payloads() {
  const out = []
  for (const q of QUESTIONS)
    for (const side of ['D', 'R']) {
      const cond = CONDITIONS[`${q.chamber}-${side}`]
      const raceKey = `${q.cycle ?? 2026}-conditional-${q.key}-${q.chamber}-${side}`
      const question = q.chamber === 'pres' ? `If ${cond.short}, ${q.ask}` : `If ${cond.short} in 2026, ${q.ask}`
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
            `This is one half of a conditional pair; its twin asks the same question if ${pair}. Comparing the two shows what the market thinks ${WHAT_CHANGES[q.chamber]} changes.`,
            '',
            'Starting probability is a seed, not a forecast: anchored on public prediction-market prices where a related market exists, otherwise a prior.',
          ].join('\n'),
          outcomeType: 'BINARY',
          initialProb: q.seeds[side],
          closeTime: utc(q.close),
          liquidityTier: 1000,
          groupIds: [...(q.chamber === 'pres' ? PRES_GROUP_IDS : GROUP_IDS), ...(q.extraGroups ?? [])],
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
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  // The market by id, or undefined. A new market can take a few seconds to be
  // readable, so `tries` > 1 polls for it.
  const getMarket = async (id, tries = 1) => {
    for (let i = 0; i < tries; i++) {
      if (i) await sleep(2000)
      const res = await fetch(`${API}/v0/market/${id}`).catch(() => undefined)
      if (res?.ok) return res.json()
    }
    return undefined
  }
  for (const m of markets) {
    const existing = await getMarket(m.idempotencyKey)
    if (existing) {
      console.log(`exists  ${existing.url}`)
      continue
    }
    let created
    for (let attempt = 1; !created; attempt++) {
      const res = await fetch(`${API}/v0/market`, {
        method: 'POST',
        headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...m.body, idempotencyKey: m.idempotencyKey }),
      })
      const text = await res.text()
      if (res.ok) created = JSON.parse(text)
      else if (res.status >= 500 && attempt < 3) {
        // A gateway error can come before or after the market is written: look
        // for it under its reserved id before trying again.
        console.log(`  ${m.raceKey}: HTTP ${res.status}, checking before retrying`)
        await sleep(5000)
        created = await getMarket(m.idempotencyKey, 3)
      } else throw new Error(`${m.raceKey}: HTTP ${res.status} ${text.slice(0, 300)}`)
    }
    const check = await getMarket(created.id, 5)
    const prob = check?.probability
    const ok = Number.isFinite(prob) && Math.abs(prob * 100 - m.body.initialProb) < 1
    const shown = Number.isFinite(prob) ? `${(prob * 100).toFixed(1)}%` : 'unreadable'
    console.log(`${ok ? 'created' : 'CHECK SEED'}  ${shown}  ${created.url}`)
    await sleep(1000)
  }
})().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
