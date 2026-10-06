// Stage B seed refresh for the 2028/2032/2036 manifests. Re-runnable.
//
//   cd backend/scripts
//   npx ts-node --transpile-only elections-2028-2036/market-seeds.ts --check
//   npx ts-node --transpile-only elections-2028-2036/market-seeds.ts \
//     [--cycle 2028] [--snapshot <saved snapshot>] [--results-2026 <file>]
//
// Priority per race: a usable public Kalshi quote (same matching and spread
// rules as the 2026 refresh), otherwise the Stage A prior, blended with the
// certified 2026 result for the same unit when --results-2026 is given.
// Writes (without --check): out/seed-snapshot.json, out/seed-mapping.json,
// out/seed-coverage.md and the manifests' seed fields only; every refresh
// resets review.approved to false. Public unauthenticated GETs only.
import * as fs from 'fs'
import * as path from 'path'
import {
  API_BASE,
  compactMarket,
  Event,
  Market,
  normalizeSeeds,
  patchJson,
  PublicMarketData,
  Snapshot,
  usableQuote,
} from '../elections-2026/market-seeds'
import { Cycle, CYCLES } from './cycles'
import { inventories, nationalResults, Results, STATE_NAMES } from './inventory'
import {
  describeSeed,
  otherShareFor,
  SeedOffice,
  stageASeed,
  TwoParty,
  twoPartyMargin,
} from './seeds'

type Json = Record<string, any>

export const RESULTS_2026_WEIGHT: Record<SeedOffice, number> = {
  // Weight of the certified 2026 result's lean against the presidential lean.
  house: 0.5, // the district's own 2026 House result
  senate: 0.3, // the state's 2026 House vote (statewide two-party), or its 2026 Senate race
  governor: 0.2, // the state's 2026 House vote
  president: 0, // presidential units keep the presidential lean
}

// Certified 2026 results, filled in by hand from the state certifications in
// December 2026. Two-party votes only; omit uncontested races.
export type Results2026 = {
  house?: Record<string, TwoParty> // 'AL-01', 'AK-00' …
  senate?: Record<string, TwoParty> // 'GA' …
  nationalHouse?: TwoParty // sum of contested House races
}

// ---------------------------------------------------------------------------
// Discovery: only series that can hold a party-winner market for our races.
// ---------------------------------------------------------------------------
export function relevantSeries2028(s: Json): boolean {
  return (
    /Politics|Elections/i.test(s.category ?? '') &&
    /^(KX)?(PRESPARTY|PRES$|SENATE|GOV|HOUSERACE)/.test(s.ticker ?? '')
  )
}

const CYCLE_YEAR_RE = (cycle: Cycle) =>
  new RegExp(
    `(?:^|-)(?:${cycle}|${String(cycle).slice(2)})(?:-|$)|\\b${cycle}\\b`
  )

export function eventIsForCycle(e: Json, markets: Json[], cycle: Cycle) {
  const text = `${e.event_ticker ?? ''} ${e.title ?? ''} ${e.sub_title ?? ''}`
  if (CYCLE_YEAR_RE(cycle).test(text)) return true
  return markets.some((m) =>
    new RegExp(
      `term beginning in ${
        cycle + 1
      }|pursuant to the ${cycle} election|\\b${cycle}\\b`
    ).test(m.rules_primary ?? '')
  )
}

export async function discover2028(
  client = new PublicMarketData(),
  cycles: readonly Cycle[] = CYCLES
): Promise<Snapshot> {
  const allSeries = await client.pages('/series', 'series')
  const series = allSeries
    .filter(relevantSeries2028)
    .map((s) => ({ ticker: s.ticker, title: s.title, category: s.category }))
  const snapshot: Snapshot = {
    apiBase: API_BASE,
    fetchedAt: new Date().toISOString(),
    series,
    events: [],
    markets: {},
  }
  for (const [index, s] of series.entries()) {
    const events = await client.pages('/events', 'events', {
      series_ticker: s.ticker,
      with_nested_markets: 'true',
      limit: '200',
    })
    for (const e of events) {
      const nested: Json[] = Array.isArray(e.markets) ? e.markets : []
      if (!cycles.some((c) => eventIsForCycle(e, nested, c))) continue
      const markets = Array.isArray(e.markets)
        ? nested
        : await client.pages('/markets', 'markets', {
            event_ticker: e.event_ticker,
            limit: '1000',
          })
      const fetchedAt = new Date().toISOString()
      const event: Event = {
        ticker: e.event_ticker,
        seriesTicker: s.ticker,
        title: e.title ?? '',
        subtitle: e.sub_title ?? '',
        mutuallyExclusive: e.mutually_exclusive === true,
        markets: [],
      }
      for (const raw of markets) {
        const market = compactMarket(raw, fetchedAt)
        if (market.eventTicker !== event.ticker)
          throw new Error('Market/event mismatch')
        snapshot.markets[market.ticker] = market
        event.markets.push(market.ticker)
      }
      snapshot.events.push(event)
    }
    if (index % 25 === 0)
      process.stderr.write(
        `Market-price discovery ${index + 1}/${series.length} series\n`
      )
  }
  snapshot.fetchedAt = new Date().toISOString()
  return snapshot
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------
export type Match = {
  status: 'usable' | 'thin' | 'unmatched'
  reason: string
  tickers: string[]
  eventTickers?: string[]
  matching?: string[]
  prices?: { ticker: string; answer: number; price: number; flag?: string }[]
  proposed?: number[]
}

const yearOf = (token: string, cycle: Cycle) =>
  token === String(cycle) || token === String(cycle).slice(2)

// Which of our answers a Kalshi market prices: 0 D, 1 R, 2 other.
export function outcomeIndexFor(m: Market): number | undefined {
  const text = `${m.title} ${m.yesSubtitle} ${m.rulesPrimary}`
  if (
    /representative of the Democratic party|\bDemocrat(ic|s)?\b(?! .*Republican)/i.test(
      text
    ) &&
    !/Republican/i.test(
      m.yesSubtitle + ' ' + m.title.replace(/Democrat\w*/i, '')
    )
  )
    return 0
  if (
    /representative of the Republican party|\bRepublican(s)?\b/i.test(text) &&
    !/Democrat/i.test(
      m.yesSubtitle + ' ' + m.title.replace(/Republican\w*/i, '')
    )
  )
    return 1
  if (
    /as an independent|independent|third[- ]party|other party|\bother\b/i.test(
      text
    )
  )
    return 2
  return undefined
}

export function eventMatches(
  entry: Json,
  event: Event,
  markets: Market[]
): { ok: boolean; why: string } {
  const id = entry.identity
  const cycle: Cycle = id.cycle
  const stateName = STATE_NAMES[id.state] ?? ''
  const title = `${event.title} ${event.subtitle}`
  const rulesYearOk = (needle: RegExp) =>
    markets.every(
      (m) => !/\b20\d\d\b/.test(m.rulesPrimary) || needle.test(m.rulesPrimary)
    )
  if (
    /primary|nomin|margin|popular vote|exact outcome|combo|seats|control|within|occur|tie\b|faithless/i.test(
      title
    )
  )
    return { ok: false, why: 'derivative event' }
  if (id.office === 'president') {
    if (id.state === 'US') {
      const m = event.ticker.match(/^(KX)?PRESPARTY-(\d{4}|\d{2})$/)
      if (!m) return { ok: false, why: 'not a national party event' }
      if (!yearOf(m[2], cycle)) return { ok: false, why: 'other year' }
      if (!/presiden/i.test(title))
        return { ok: false, why: 'title is not presidential' }
      return { ok: true, why: `national party event ${event.ticker}` }
    }
    const m = event.ticker.match(
      /^(KX)?PRESPARTY(?:STATE-)?([A-Z]{2})(\d)?-(\d{4}|\d{2})$/
    )
    if (!m) return { ok: false, why: 'not a state presidential event' }
    if (m[2] !== id.state) return { ok: false, why: 'other state' }
    if (!yearOf(m[4], cycle)) return { ok: false, why: 'other year' }
    const district = m[3] ? Number(m[3]) : undefined
    if ((id.district ?? undefined) !== district)
      return { ok: false, why: 'district mismatch' }
    if (
      !new RegExp(
        `\\b${stateName}\\b|\\b${id.state}-${district ?? ''}`,
        'i'
      ).test(title)
    )
      return { ok: false, why: 'title does not name the unit' }
    if (!rulesYearOk(new RegExp(`\\b${cycle}\\b`)))
      return { ok: false, why: 'rules name another year' }
    return { ok: true, why: `state presidential event ${event.ticker}` }
  }
  if (id.office === 'senate') {
    const m = event.ticker.match(
      /^(KX)?SENATE(?:PARTY)?([A-Z]{2})-(\d{4}|\d{2})$/
    )
    if (!m) return { ok: false, why: 'not a Senate race event' }
    if (m[2] !== id.state) return { ok: false, why: 'other state' }
    if (!yearOf(m[3], cycle)) return { ok: false, why: 'other year' }
    if (
      !/senat/i.test(title) ||
      !new RegExp(`\\b${stateName}\\b`, 'i').test(title)
    )
      return { ok: false, why: 'title does not name the state Senate race' }
    if (/special/i.test(title)) return { ok: false, why: 'special election' }
    if (
      !rulesYearOk(new RegExp(`term beginning in ${cycle + 1}|\\b${cycle}\\b`))
    )
      return { ok: false, why: 'rules name another term' }
    return {
      ok: true,
      why: `Senate event ${event.ticker}; term beginning ${cycle + 1}`,
    }
  }
  if (id.office === 'governor') {
    const m = event.ticker.match(
      /^(KX)?GOV(?:PARTY)?-?([A-Z]{2})-(\d{4}|\d{2})$/
    )
    if (!m) return { ok: false, why: 'not a governor event' }
    if (m[2] !== id.state) return { ok: false, why: 'other state' }
    if (!yearOf(m[3], cycle)) return { ok: false, why: 'other year' }
    if (
      !/governor|gubernator/i.test(title) ||
      !new RegExp(`\\b${stateName}\\b`, 'i').test(title)
    )
      return { ok: false, why: 'title does not name the governorship' }
    // GOVPARTYNH-28 carries 2026 rules text: the rules, not the ticker, decide.
    if (
      !rulesYearOk(
        new RegExp(`pursuant to the ${cycle} election|\\b${cycle}\\b`)
      )
    )
      return { ok: false, why: 'rules name another election year' }
    return {
      ok: true,
      why: `governor event ${event.ticker}; ${cycle} election`,
    }
  }
  if (id.office === 'house') {
    const m = event.ticker.match(/^KXHOUSERACE-([A-Z]{2})(\d{2})-(\d{2})$/)
    if (!m) return { ok: false, why: 'not a House race event' }
    const district = id.district === 0 ? 1 : id.district
    if (m[1] !== id.state || Number(m[2]) !== district)
      return { ok: false, why: 'other district' }
    if (!yearOf(m[3], cycle)) return { ok: false, why: 'other year' }
    if (
      !rulesYearOk(new RegExp(`term beginning in ${cycle + 1}|\\b${cycle}\\b`))
    )
      return { ok: false, why: 'rules name another term' }
    return {
      ok: true,
      why: `House event ${event.ticker}; at-large 0 maps to 01`,
    }
  }
  return { ok: false, why: 'unsupported office' }
}

// `otherShare` is the reviewed Stage A share for "Another party or
// independent" (SEEDS.md). When the Kalshi event prices no independent or
// third-party outcome, that share is kept and the two major parties split the
// rest; when it does (e.g. SENATEPA-28-JFET), the quoted price is used.
export function matchEntry(
  entry: Json,
  snapshot: Snapshot,
  otherShare = 1
): Match {
  if (!(otherShare >= 1 && otherShare <= 50))
    throw new Error('otherShare out of range')
  const candidates = snapshot.events.filter(
    (event) =>
      eventMatches(
        entry,
        event,
        event.markets.map((t) => snapshot.markets[t])
      ).ok
  )
  if (!candidates.length)
    return {
      status: 'unmatched',
      tickers: [],
      reason: 'No exact party-winner event for this race and year',
    }
  const evaluated = candidates.map((event): Match => {
    const base = {
      tickers: event.markets,
      eventTickers: [event.ticker],
      matching: [
        eventMatches(
          entry,
          event,
          event.markets.map((t) => snapshot.markets[t])
        ).why,
        'Outcomes mapped to Democratic / Republican / Another party by market party text; unrepresented outcomes aggregate to Another party',
      ],
    }
    if (!event.mutuallyExclusive)
      return {
        ...base,
        status: 'unmatched',
        reason: 'Event outcomes are not mutually exclusive',
      }
    const prices: NonNullable<Match['prices']> = []
    const totals = [0, 0, 0]
    for (const ticker of event.markets) {
      const market = snapshot.markets[ticker]
      const answer = outcomeIndexFor(market)
      if (answer === undefined)
        return {
          ...base,
          status: 'unmatched',
          reason: `${ticker}: cannot tell which party it prices`,
        }
      const quote = usableQuote(market)
      if ('reason' in quote)
        return { ...base, status: 'thin', reason: `${ticker}: ${quote.reason}` }
      prices.push({ ticker, answer, ...quote })
      totals[answer] += quote.price
    }
    if (![0, 1].every((i) => prices.some((p) => p.answer === i)))
      return {
        ...base,
        status: 'unmatched',
        reason: 'Missing an explicit quote for a major party',
      }
    const independentQuoted = prices.some((p) => p.answer === 2)
    if (!independentQuoted)
      totals[2] = ((totals[0] + totals[1]) * otherShare) / (100 - otherShare)
    return {
      ...base,
      status: 'usable',
      reason: `Usable outcome midpoints normalized; 1% floor; largest answer receives rounding remainder; "Another party" ${
        independentQuoted
          ? 'from the quoted independent/third-party market'
          : `kept at the reviewed ${otherShare}%`
      }`,
      prices,
      proposed: normalizeSeeds(totals),
    }
  })
  const rank = (m: Match) =>
    m.status === 'usable' ? 0 : m.status === 'thin' ? 1 : 2
  const volume = (m: Match) =>
    m.tickers.reduce((n, t) => n + (snapshot.markets[t]?.volume ?? 0), 0)
  evaluated.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      volume(b) - volume(a) ||
      a.tickers.join().localeCompare(b.tickers.join())
  )
  return evaluated[0]
}

// ---------------------------------------------------------------------------
// Priors (Stage A, optionally blended with certified 2026 results)
// ---------------------------------------------------------------------------
export function priorFor(
  entry: Json,
  results: Results,
  results2026?: Results2026
) {
  const id = entry.identity
  const office: SeedOffice = id.office
  const national = nationalResults(results)
  const unitKey =
    id.state === 'US'
      ? 'US'
      : id.district !== undefined
      ? `${id.state}-${
          id.district === 0 ? 'AL' : String(id.district).padStart(2, '0')
        }`
      : id.state
  const row =
    id.state === 'US'
      ? {}
      : id.district !== undefined
      ? results.districts[unitKey]
      : results.states[unitKey]
  if (!row) throw new Error(`no results for ${unitKey}`)
  const unit = {
    ...(row[2020] ? { 2020: row[2020] } : {}),
    ...(row[2024] ? { 2024: row[2024] } : {}),
  }
  let blend: { lean: number; weight: number } | undefined
  let blendNote = ''
  if (
    results2026 &&
    RESULTS_2026_WEIGHT[office] > 0 &&
    results2026.nationalHouse
  ) {
    const nat = twoPartyMargin(results2026.nationalHouse)
    let own: TwoParty | undefined
    let what = ''
    if (office === 'house') {
      own = results2026.house?.[unitKey]
      what = `${unitKey} 2026 House result`
    } else if (office === 'senate' && results2026.senate?.[id.state]) {
      own = results2026.senate[id.state]
      what = `${id.state} 2026 Senate result`
    } else {
      const rows = Object.entries(results2026.house ?? {}).filter(([k]) =>
        k.startsWith(`${id.state}-`)
      )
      if (rows.length) {
        own = rows.reduce((a, [, r]) => ({ d: a.d + r.d, r: a.r + r.r }), {
          d: 0,
          r: 0,
        })
        what = `${id.state} 2026 statewide House vote (${rows.length} contested districts)`
      }
    }
    if (own) {
      blend = {
        lean: twoPartyMargin(own) - nat,
        weight: RESULTS_2026_WEIGHT[office],
      }
      blendNote = `; blended with the ${what} (lean ${blend.lean.toFixed(
        1
      )} pts vs the national House vote) at weight ${blend.weight}`
    }
  }
  const seed = stageASeed({
    cycle: id.cycle,
    office,
    state: id.state,
    unit,
    national,
    nationalMarket: id.state === 'US',
    blend,
  })
  return {
    seed,
    basis: describeSeed(seed, id.cycle).replace(
      'See SEEDS.md.',
      `${blendNote}. See SEEDS.md.`.replace(/^; /, '').replace('^. ', '')
    ),
  }
}

// ---------------------------------------------------------------------------
// Reseed one manifest
// ---------------------------------------------------------------------------
export type Row = Match & {
  raceKey: string
  cycle: Cycle
  office: string
  source: 'market-price' | 'prior' | 'prior+2026'
  old: number[]
  next: number[]
  labels: string[]
}
type Edit = { keys: (string | number)[]; value: unknown; decimal?: boolean }

export function reseed(
  raw: string,
  snapshot: Snapshot,
  results: Results,
  now: string,
  results2026?: Results2026
) {
  const manifest: Json = JSON.parse(raw)
  const edits: Edit[] = []
  const rows: Row[] = []
  manifest.entries.forEach((entry: Json, i: number) => {
    const old: number[] = entry.payload?.answerProbs ?? []
    const match =
      entry.status !== 'ready'
        ? ({
            status: 'unmatched',
            tickers: [],
            reason: 'Held entry; no seed refresh',
          } as Match)
        : matchEntry(
            entry,
            snapshot,
            otherShareFor(
              entry.identity.cycle,
              entry.identity.office,
              entry.identity.state
            ).other
          )
    let next = old
    let source: Row['source'] = 'prior'
    if (match.status === 'usable') {
      next = match.proposed!
      source = 'market-price'
      edits.push({
        keys: ['entries', i, 'payload', 'answerProbs'],
        value: next,
        decimal: true,
      })
      edits.push({
        keys: ['entries', i, 'seed', 'basis'],
        value: `Public market order-book seed fetched ${snapshot.fetchedAt}; ${
          match.reason
        }. ${match.tickers.join(
          ', '
        )}. Seed, not a guaranteed forecast; source settlement criteria (sworn-in member / inaugurated governor) differ from our certified-winner rule. See out/seed-mapping.json for identity evidence.`,
      })
      edits.push({
        keys: ['entries', i, 'seed', 'source'],
        value: {
          kind: 'market-price',
          apiBase: API_BASE,
          tickers: match.tickers,
          fetchedAt: snapshot.fetchedAt,
          quotes: match.prices!.map((p) => {
            const m = snapshot.markets[p.ticker]
            return {
              ...p,
              yesBid: m.yesBid,
              yesAsk: m.yesAsk,
              lastPrice: m.lastPrice,
              volume: m.volume,
              volume24h: m.volume24h,
              openInterest: m.openInterest,
              fetchedAt: m.fetchedAt,
            }
          }),
        },
      })
    } else if (entry.status === 'ready') {
      const { seed, basis } = priorFor(entry, results, results2026)
      next = seed.probs
      source = results2026 ? 'prior+2026' : 'prior'
      edits.push({
        keys: ['entries', i, 'payload', 'answerProbs'],
        value: next,
        decimal: true,
      })
      edits.push({ keys: ['entries', i, 'seed', 'basis'], value: basis })
      edits.push({
        keys: ['entries', i, 'seed', 'source'],
        value: {
          kind: 'prior',
          formula: results2026
            ? 'stage-a-presidential-lean+2026-results'
            : 'stage-a-presidential-lean',
          lean: Number(seed.lean.toFixed(3)),
          sigma: Number(seed.sigma.toFixed(3)),
          pDem: Number(seed.pDem.toFixed(4)),
          other: seed.other,
          yearsUsed: seed.yearsUsed,
          resultsSource: results.sources,
          refreshedAt: now,
          marketPrice: {
            status: match.status,
            reason: match.reason,
            tickers: match.tickers,
          },
        },
      })
    }
    rows.push({
      ...match,
      raceKey: entry.raceKey,
      cycle: entry.identity.cycle,
      office: entry.identity.office,
      source,
      old,
      next,
      labels: entry.payload?.answers ?? [],
    })
  })
  const date = now.slice(0, 10)
  const version = manifest.manifestVersion.startsWith(date + '.')
    ? Number(manifest.manifestVersion.slice(date.length + 1)) + 1
    : 1
  const note = `Seed refresh ${now}: Kalshi public prices where an exact party-winner event passed the quote checks; Stage A priors${
    results2026 ? ' blended with certified 2026 results' : ''
  } elsewhere. Tod must review out/seed-coverage.md and approve this manifest again before creation.`
  edits.push(
    { keys: ['manifestVersion'], value: `${date}.${Math.max(2, version)}` },
    { keys: ['generatedAt'], value: now },
    { keys: ['review', 'approved'], value: false },
    { keys: ['review', 'reviewedBy'], value: null },
    { keys: ['review', 'reviewedAt'], value: null },
    {
      keys: ['review', 'notes'],
      value:
        (manifest.review.notes ?? '').replace(/\nSeed refresh[^\n]*/g, '') +
        '\n' +
        note,
    }
  )
  const output = patchJson(raw, edits)
  assertOnlySeedsChanged(raw, output)
  return { output, rows }
}

export function assertOnlySeedsChanged(before: string, after: string) {
  const strip = (raw: string) => {
    const m: Json = JSON.parse(raw)
    delete m.manifestVersion
    delete m.generatedAt
    delete m.review
    for (const e of m.entries) {
      if (e.payload) delete e.payload.answerProbs
      if (e.seed) {
        delete e.seed.basis
        delete e.seed.source
      }
    }
    return JSON.stringify(m)
  }
  if (strip(before) !== strip(after))
    throw new Error('A non-seed manifest field changed')
  const a: Json = JSON.parse(after)
  if (a.review.approved !== false)
    throw new Error('approval must reset to false')
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const vector = (values: number[]) => values.map((x) => x.toFixed(1)).join(' / ')
const cell = (value: string) =>
  value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')

export function makeReport(
  rows: Row[],
  snapshot: Snapshot,
  opts: { results2026: boolean; offline: boolean }
) {
  const lines = [
    '# Seed refresh — coverage report',
    '',
    `Fetched: ${snapshot.fetchedAt}${
      opts.offline ? ' (offline snapshot, not a fresh fetch)' : ''
    }. Public unauthenticated GETs only. Prices in cents.`,
    '',
    `Certified 2026 results ${
      opts.results2026 ? 'were' : 'were NOT'
    } supplied (--results-2026); priors ${
      opts.results2026
        ? 'blend them'
        : 'are the Stage A presidential leans only'
    }.`,
    '',
    'Every refreshed manifest has review.approved = false and must be approved again.',
    '',
    '| Cycle / office | Entries | Kalshi usable | Kalshi thin | No Kalshi market (prior) |',
    '|---|---:|---:|---:|---:|',
  ]
  const groups = new Map<string, Row[]>()
  for (const r of rows) {
    const k = `${r.cycle} ${r.office}`
    groups.set(k, [...(groups.get(k) ?? []), r])
  }
  for (const [k, g] of [...groups].sort())
    lines.push(
      `| ${k} | ${g.length} | ${
        g.filter((r) => r.status === 'usable').length
      } | ${g.filter((r) => r.status === 'thin').length} | ${
        g.filter((r) => r.status === 'unmatched').length
      } |`
    )
  const delta = (r: Row) =>
    Math.max(0, ...r.old.map((v, i) => Math.abs(v - (r.next[i] ?? v))))
  lines.push(
    '',
    '## Market-price seeds (every usable match)',
    '',
    '| Race | Old → new (%) | Tickers; bid / ask; volume |',
    '|---|---|---|'
  )
  for (const r of rows
    .filter((r) => r.status === 'usable')
    .sort((a, b) => delta(b) - delta(a))) {
    const quotes = r.tickers
      .map((t) => {
        const m = snapshot.markets[t]
        return `${t}: ${m.yesBid ?? '—'} / ${m.yesAsk ?? '—'}; ${
          m.volume ?? '—'
        }`
      })
      .join('; ')
    lines.push(
      `| ${r.raceKey} | ${vector(r.old)} → ${vector(r.next)} | ${cell(
        quotes
      )} |`
    )
  }
  lines.push(
    '',
    '## 25 largest changes overall',
    '',
    '| Race | Source | Old → new (%) |',
    '|---|---|---|'
  )
  for (const r of rows
    .filter((r) => delta(r) > 0)
    .sort((a, b) => delta(b) - delta(a))
    .slice(0, 25))
    lines.push(
      `| ${r.raceKey} | ${r.source} | ${vector(r.old)} → ${vector(r.next)} |`
    )
  lines.push(
    '',
    '## Thin Kalshi matches (market exists, quote unusable; prior kept)',
    '',
    '| Race | Reason | Tickers |',
    '|---|---|---|'
  )
  for (const r of rows.filter((r) => r.status === 'thin'))
    lines.push(`| ${r.raceKey} | ${cell(r.reason)} | ${r.tickers.join(', ')} |`)
  lines.push('', '## One-sided quote exceptions', '')
  const flagged = rows.flatMap((r) =>
    (r.prices ?? [])
      .filter((p) => p.flag)
      .map((p) => `${r.raceKey}: ${p.ticker}; ${p.flag}; price ${p.price}c`)
  )
  lines.push(...(flagged.length ? flagged.map((s) => '- ' + s) : ['None.']))
  lines.push(
    '',
    '## Method',
    '',
    '- Discovery reads the full series catalogue, keeps Politics/Elections series whose ticker starts with PRESPARTY, PRES, SENATE, GOV or HOUSERACE (with or without the KX prefix), then paginates their events. Only events whose ticker/title names 2028, 2032 or 2036, or whose rules name the matching term, are kept.',
    '- Matching requires the state (and district) and the year in the event ticker, the office and state name in the title, and rules text consistent with the cycle (GOVPARTYNH-28 fails because its rules say 2026). Outcomes map to Democratic / Republican by party text; independents and other parties aggregate to "Another party or independent".',
    '- Quotes: two-sided spreads of at most 10c; missing bids with an ask ≤ 2c use ask/2 (flagged); the complementary ≥ 98c form uses (bid+100)/2. Inactive markets, crossed quotes and wider spreads are thin. Last trades are never substituted for quotes.',
    '- Seeds are normalized across the three answers with a 1% floor, one decimal, remainder to the largest answer; a three-answer seed tops out at 98/1/1.',
    '- Kalshi settles on the member sworn in / governor inaugurated / party winning the presidency; our markets resolve on the certified winner, so prices are a starting reference, not settlement-equivalent.',
    '- Races without a usable Kalshi market keep a Stage A prior (SEEDS.md), blended with the certified 2026 result for the unit when --results-2026 is given.',
    ''
  )
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
export async function main(args = process.argv.slice(2)) {
  const check = args.includes('--check')
  const opt = (name: string) => {
    const i = args.indexOf(name)
    if (i < 0) return undefined
    const v = args[i + 1]
    if (!v || v.startsWith('--')) throw new Error(`${name} requires a value`)
    return v
  }
  const allowed = new Set([
    '--check',
    '--snapshot',
    '--cycle',
    '--results-2026',
    '--manifest-root',
  ])
  for (let i = 0; i < args.length; i++) {
    if (!allowed.has(args[i])) throw new Error(`Unknown option ${args[i]}`)
    if (args[i] !== '--check') i++
  }
  const cycles = opt('--cycle') ? [Number(opt('--cycle')) as Cycle] : CYCLES
  for (const c of cycles)
    if (!CYCLES.includes(c))
      throw new Error(`--cycle must be one of ${CYCLES.join(', ')}`)
  const root = opt('--manifest-root') ?? __dirname
  const snapshotFile = opt('--snapshot')
  const snapshot: Snapshot = snapshotFile
    ? JSON.parse(fs.readFileSync(snapshotFile, 'utf8'))
    : await discover2028(new PublicMarketData(), cycles)
  if (
    snapshot.apiBase !== API_BASE ||
    !snapshot.fetchedAt ||
    !Array.isArray(snapshot.events) ||
    !snapshot.markets
  )
    throw new Error('Invalid public market-price snapshot')
  const results2026File = opt('--results-2026')
  const results2026: Results2026 | undefined = results2026File
    ? JSON.parse(fs.readFileSync(results2026File, 'utf8'))
    : undefined
  const results = inventories.results()
  const now = new Date().toISOString()
  const manifests = cycles.map((cycle) => {
    const file = path.join(root, String(cycle), 'manifest.json')
    return {
      cycle,
      file,
      ...reseed(
        fs.readFileSync(file, 'utf8'),
        snapshot,
        results,
        now,
        results2026
      ),
    }
  })
  const rows = manifests.flatMap((m) => m.rows)
  const report = makeReport(rows, snapshot, {
    results2026: !!results2026,
    offline: !!snapshotFile,
  })
  const mapping = {
    fetchedAt: snapshot.fetchedAt,
    refreshedAt: now,
    results2026: results2026File ?? null,
    markets: Object.fromEntries(rows.map((r) => [r.raceKey, r])),
  }
  if (check) process.stdout.write(report)
  else {
    const out = path.join(root, 'out')
    fs.mkdirSync(out, { recursive: true })
    fs.writeFileSync(
      path.join(out, 'seed-snapshot.json'),
      JSON.stringify(snapshot, null, 2) + '\n'
    )
    fs.writeFileSync(
      path.join(out, 'seed-mapping.json'),
      JSON.stringify(mapping, null, 2) + '\n'
    )
    fs.writeFileSync(path.join(out, 'seed-coverage.md'), report)
    for (const m of manifests) fs.writeFileSync(m.file, m.output)
  }
  const coverage: Json = {}
  for (const r of rows) {
    const k = `${r.cycle}-${r.office}`
    coverage[k] ??= { usable: 0, thin: 0, unmatched: 0 }
    coverage[k][r.status]++
  }
  process.stdout.write(
    JSON.stringify(
      {
        mode: check ? 'check (no writes)' : 'seed refresh',
        fetchedAt: snapshot.fetchedAt,
        offlineSnapshot: !!snapshotFile,
        results2026: !!results2026,
        coverage,
      },
      null,
      2
    ) + '\n'
  )
}

if (require.main === module)
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
