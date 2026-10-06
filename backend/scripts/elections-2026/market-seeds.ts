// Public GET market data only. Never imports the creation CLI or sends credentials.
// npx ts-node --transpile-only elections-2026/market-seeds.ts [--check]
import * as fs from 'fs'
import * as path from 'path'
import { createHash } from 'crypto'
import * as ts from 'typescript'

export const API_BASE = 'https://api.elections.kalshi.com/trade-api/v2'
const RI = '2026-governor-RI-regular-general'
type Json = Record<string, any>
export type Market = {
  ticker: string
  eventTicker: string
  title: string
  subtitle: string
  yesSubtitle: string
  rulesPrimary: string
  status: string
  createdTime: string
  occurrenceTime: string
  yesBid: number | null
  yesAsk: number | null
  noBid: number | null
  noAsk: number | null
  lastPrice: number | null
  bidSize: number | null
  askSize: number | null
  volume: number | null
  volume24h: number | null
  openInterest: number | null
  fetchedAt: string
}
export type Event = {
  ticker: string
  seriesTicker: string
  title: string
  subtitle: string
  mutuallyExclusive: boolean
  markets: string[]
}
export type Snapshot = {
  apiBase: string
  fetchedAt: string
  series: { ticker: string; title: string; category: string }[]
  events: Event[]
  markets: Record<string, Market>
}
type Quote = { price: number; flag?: string } | { reason: string }
export type Review = {
  raceKey: string
  ticker: string
  manifestIdentity: string
  marketIdentity: string
  direction: 'approval' | 'failure'
  evidence: string
}
type Match = {
  status: 'usable' | 'thin' | 'unmatched' | 'held' | 'preserved'
  reason: string
  tickers: string[]
  eventTickers?: string[]
  matching?: string[]
  prices?: { ticker: string; answer: number; price: number; flag?: string }[]
  proposed?: number[]
}
export type Row = Match & {
  raceKey: string
  office: string
  old: number[]
  next: number[]
  labels: string[]
  liquidityTier: number
}
const num = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null
  const result = Number(value)
  return Number.isFinite(result) ? result : null
}
const priceField = (raw: Json, name: string) => {
  const dollars = num(raw[`${name}_dollars`])
  return dollars === null
    ? num(raw[name])
    : Math.round(dollars * 100 * 1e8) / 1e8
}
export function compactMarket(raw: Json, fetchedAt: string): Market {
  if (typeof raw.ticker !== 'string' || typeof raw.event_ticker !== 'string')
    throw new Error('Malformed reference market identity')
  return {
    ticker: raw.ticker,
    eventTicker: raw.event_ticker,
    title: raw.title ?? '',
    subtitle: raw.subtitle ?? '',
    yesSubtitle: raw.yes_sub_title ?? '',
    rulesPrimary: raw.rules_primary ?? '',
    status: raw.status ?? '',
    createdTime: raw.created_time ?? '',
    occurrenceTime: raw.occurrence_datetime ?? '',
    yesBid: priceField(raw, 'yes_bid'),
    yesAsk: priceField(raw, 'yes_ask'),
    noBid: priceField(raw, 'no_bid'),
    noAsk: priceField(raw, 'no_ask'),
    lastPrice: priceField(raw, 'last_price'),
    bidSize: num(raw.yes_bid_size_fp),
    askSize: num(raw.yes_ask_size_fp),
    volume: num(raw.volume_fp) ?? num(raw.volume),
    volume24h: num(raw.volume_24h_fp) ?? num(raw.volume_24h),
    openInterest: num(raw.open_interest_fp) ?? num(raw.open_interest),
    fetchedAt,
  }
}

// A zero-size/zero-bid book is absent, not a real two-sided quote.
export function usableQuote(m: Market): Quote {
  if (!['active', 'open'].includes(m.status))
    return { reason: `market status is ${m.status}` }
  for (const value of [m.yesBid, m.yesAsk])
    if (value !== null && (value < 0 || value > 100))
      return { reason: 'invalid quote outside 0-100 cents' }
  const bid = m.bidSize === 0 || m.yesBid === 0 ? null : m.yesBid
  const ask = m.askSize === 0 || m.yesAsk === 100 ? null : m.yesAsk
  if (bid !== null && ask !== null) {
    if (ask < bid) return { reason: 'crossed quote' }
    if (ask - bid > 10 + 1e-8)
      return { reason: `spread ${(ask - bid).toFixed(2)}c exceeds 10c` }
    return { price: (bid + ask) / 2 }
  }
  if (bid === null && ask !== null && ask > 0 && ask <= 2)
    return { price: ask / 2, flag: 'one-sided extreme: midpoint of 0 and ask' }
  // The complementary form of the same long-shot exception: NO ask <= 2c.
  if (ask === null && bid !== null && bid >= 98 && bid < 100)
    return {
      price: (bid + 100) / 2,
      flag: 'one-sided extreme: midpoint of bid and 100 (NO ask/2)',
    }
  return { reason: 'missing usable two-sided quote' }
}

export function normalizeSeeds(weights: number[]): number[] {
  if (
    weights.length < 2 ||
    weights.length > 100 ||
    weights.some((x) => !Number.isFinite(x) || x < 0)
  )
    throw new Error('Invalid seed weights')
  if (weights.every((x) => x === 0))
    throw new Error('All seed weights are zero')
  const values = weights.map(() => 0)
  let free = weights.map((_, i) => i)
  let remaining = 100
  while (free.length) {
    const sum = free.reduce((n, i) => n + weights[i], 0)
    const below = free.filter(
      (i) =>
        (sum ? (weights[i] / sum) * remaining : remaining / free.length) < 1
    )
    if (!below.length) {
      free.forEach((i) => {
        values[i] = sum
          ? (weights[i] / sum) * remaining
          : remaining / free.length
      })
      break
    }
    below.forEach((i) => {
      values[i] = 1
      remaining--
    })
    free = free.filter((i) => !below.includes(i))
  }
  const tenths = values.map((x) => Math.round(x * 10))
  const largest = values.indexOf(Math.max(...values))
  tenths[largest] += 1000 - tenths.reduce((a, b) => a + b, 0)
  const result = tenths.map((x) => x / 10)
  if (result.some((x) => x < 1 || x > 99))
    throw new Error('Seed bounds violated')
  return result
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
export class PublicMarketData {
  private lastRequest = 0
  constructor(
    private fetcher: typeof fetch = fetch,
    private pause = sleep,
    private now = Date.now
  ) {}
  async get(
    endpoint: '/series' | '/events' | '/markets',
    params: Record<string, string> = {}
  ): Promise<Json> {
    if (!['/series', '/events', '/markets'].includes(endpoint))
      throw new Error('Read-only endpoint required')
    const url = new URL(API_BASE + endpoint)
    Object.entries(params).forEach(([key, value]) =>
      url.searchParams.set(key, value)
    )
    for (let attempt = 0; attempt < 6; attempt++) {
      await this.pause(Math.max(0, 300 - (this.now() - this.lastRequest)))
      this.lastRequest = this.now()
      const response = await this.fetcher(url, {
        method: 'GET',
        redirect: 'error',
        signal: AbortSignal.timeout(60000),
      })
      if (response.status === 429 || response.status >= 500) {
        if (attempt === 5)
          throw new Error(`Reference market ${response.status}: ${url}`)
        const retry = response.headers.get('retry-after')
        const seconds = num(retry)
        const retryMs =
          seconds !== null
            ? seconds * 1000
            : retry
            ? Math.max(0, Date.parse(retry) - this.now())
            : 0
        await this.pause(
          Math.max(2000 * 2 ** attempt, Number.isFinite(retryMs) ? retryMs : 0)
        )
        continue
      }
      if (!response.ok)
        throw new Error(`Reference market ${response.status}: ${url}`)
      return response.json()
    }
    throw new Error('Reference market retry limit exceeded')
  }
  async pages(
    endpoint: '/series' | '/events' | '/markets',
    key: string,
    params: Record<string, string> = {}
  ): Promise<Json[]> {
    const result: Json[] = []
    const cursors = new Set<string>()
    let cursor = ''
    do {
      const body = await this.get(endpoint, {
        ...params,
        ...(cursor ? { cursor } : {}),
      })
      if (!Array.isArray(body[key]))
        throw new Error(`Reference market response missing ${key}`)
      result.push(...body[key])
      cursor = body.cursor ?? ''
      if (cursor && cursors.has(cursor))
        throw new Error(`Repeated ${key} cursor`)
      cursors.add(cursor)
    } while (cursor)
    return result
  }
}

export function relevantSeries(s: Json): boolean {
  return (
    /Politics|Elections/i.test(s.category ?? '') &&
    /house|congressional|ballot|measure|proposition|proposal|referend|amendment|initiative|constitutional|ranked.choice/i.test(
      `${s.title ?? ''} ${s.ticker ?? ''}`
    )
  )
}
export async function discover(
  client = new PublicMarketData()
): Promise<Snapshot> {
  const allSeries = await client.pages('/series', 'series')
  const series = allSeries
    .filter(relevantSeries)
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
      // The nested endpoint returns the event's markets; paginate /markets as a
      // fallback when the event response omits them.
      const nested: Json[] = Array.isArray(e.markets) ? e.markets : []
      const useful =
        /2026|2027|26/.test(
          e.event_ticker + ' ' + e.title + ' ' + e.sub_title
        ) ||
        nested.some(
          (m) =>
            /^2026/.test(m.created_time ?? '') &&
            ['active', 'open'].includes(m.status)
        )
      if (!useful) continue
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

const normalized = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export function houseEventMatches(
  entry: Json,
  event: Event,
  markets: Market[]
): boolean {
  const title = `${event.title} ${event.subtitle}`
  if (
    !/house|congressional/i.test(title) ||
    /state house|delegates|primary|nomina|special|margin|popular vote|combo|seats|exit poll|control/i.test(
      title
    )
  )
    return false
  // Term beginning in 2027 is the API's explicit cycle evidence for many events.
  const cycle =
    /(?:^|-)26(?:-|$)/.test(event.ticker) ||
    /\b2026\b/.test(title) ||
    markets.some((m) => /term beginning in 2027/.test(m.rulesPrimary))
  if (!cycle || /(?:^|-)(?:24|25|27|28)(?:-|$)/.test(event.ticker)) return false
  const district = entry.identity.district === 0 ? 1 : entry.identity.district
  const code = new RegExp(
    `\\b${entry.identity.state}[- ](?:0?${district}${
      district === 1 ? '|AL' : ''
    })\\b`,
    'i'
  )
  const state = escaped(entry.identity.stateName)
  const long = new RegExp(
    `\\b${state}(?:['’]s)?\\s+(?:(?:congressional )?district\\s+)?(?:0?${district}(?:st|nd|rd|th)?\\b${
      district === 1 ? '|at[- ]large\\b' : ''
    })`,
    'i'
  )
  return code.test(title) || long.test(title)
}
function outcomeIndex(entry: Json, market: Market): number | undefined {
  const meta: Json[] = entry.answerMeta
  if (entry.proposition === 'candidate') {
    const name = normalized(market.yesSubtitle)
    const match = meta.findIndex(
      (a) => normalized(a.candidate ?? a.label) === name
    )
    // A party market is not a candidate market, even when subtitles name candidates.
    if (
      /is a member of the (Democratic|Republican) Party/i.test(
        market.rulesPrimary
      )
    )
      return undefined
    return match >= 0 ? match : undefined
  }
  const winner = market.title.match(/^Will (.+?) win (?:the )?House race/i)?.[1]
  let party =
    winner && /^(Democratic|Democrat)(?: party)?$/i.test(winner)
      ? 'D'
      : winner && /^Republican(?: party)?$/i.test(winner)
      ? 'R'
      : undefined
  if (!party) {
    const exact = meta.find(
      (a) =>
        a.candidate &&
        normalized(a.candidate) === normalized(market.yesSubtitle)
    )
    party = exact?.party
  }
  if (party) {
    const i = meta.findIndex((a) => a.party === party)
    if (i >= 0) return i
  }
  const other = meta.findIndex((a) => a.kind === 'other' || a.party === 'other')
  return other >= 0 ? other : undefined
}
export function matchHouse(entry: Json, snapshot: Snapshot): Match {
  const candidates = snapshot.events.filter((event) =>
    houseEventMatches(
      entry,
      event,
      event.markets.map((t) => snapshot.markets[t])
    )
  )
  if (!candidates.length)
    return {
      status: 'unmatched',
      tickers: [],
      reason: 'No exact 2026 regular U.S. House state/district event',
    }
  const evaluated = candidates.map((event) => {
    const tickers = event.markets
    const base = {
      tickers,
      eventTickers: [event.ticker],
      matching: [
        `Exact ${entry.identity.state}-${
          entry.identity.district || 1
        } from event title: ${
          event.title
        }; 2026 election / 2027 term; at-large manifest district 0 maps to district 1`,
        'Outcomes mapped using answerMeta; unrepresented parties/candidates aggregate to Other',
      ],
    }
    if (!event.mutuallyExclusive)
      return {
        ...base,
        status: 'unmatched',
        reason: 'Event outcomes are not mutually exclusive',
      } as Match
    const prices: NonNullable<Match['prices']> = []
    const totals = entry.payload.answers.map(() => 0) as number[]
    for (const ticker of tickers) {
      const market = snapshot.markets[ticker]
      const answer = outcomeIndex(entry, market)
      if (answer === undefined)
        return {
          ...base,
          status: 'unmatched',
          reason:
            'Party event cannot distinguish the named same-party candidates',
        } as Match
      const quote = usableQuote(market)
      if ('reason' in quote)
        return {
          ...base,
          status: 'thin',
          reason: `${ticker}: ${quote.reason}`,
        } as Match
      prices.push({ ticker, answer, ...quote })
      totals[answer] += quote.price
    }
    const required: number[] = entry.answerMeta.flatMap((a: Json, i: number) =>
      a.kind === 'other' || a.party === 'other' ? [] : [i]
    )
    if (required.some((i) => !prices.some((p) => p.answer === i)))
      return {
        ...base,
        status: 'unmatched',
        reason:
          'Missing explicit quote for a required major-party/candidate outcome',
      } as Match
    if (!prices.length)
      return { ...base, status: 'unmatched', reason: 'No outcomes' } as Match
    return {
      ...base,
      status: 'usable',
      reason:
        'Usable outcome midpoints normalized; 1% floor; largest answer receives rounding remainder',
      prices,
      proposed: normalizeSeeds(totals),
    } as Match
  })
  const rank = (m: Match) =>
    m.status === 'usable' ? 0 : m.status === 'thin' ? 1 : 2
  evaluated.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      b.tickers.reduce((n, t) => n + (snapshot.markets[t].volume ?? 0), 0) -
        a.tickers.reduce((n, t) => n + (snapshot.markets[t].volume ?? 0), 0) ||
      a.tickers.join().localeCompare(b.tickers.join())
  )
  return evaluated[0]
}

const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex')
export const manifestIdentity = (entry: Json) =>
  hash({
    state: entry.measure.state,
    designation: entry.measure.designation,
    title: entry.measure.officialTitle,
    subject: entry.measure.shortSubject,
    yesMeaning: entry.yesMeaning,
  })
export const marketIdentity = (market: Market, event: Event) =>
  hash({
    title: market.title,
    subtitle: market.subtitle,
    yesSubtitle: market.yesSubtitle,
    rulesPrimary: market.rulesPrimary,
    eventTitle: event.title,
    eventSubtitle: event.subtitle,
  })
export function matchBallot(
  entry: Json,
  snapshot: Snapshot,
  reviews: Review[]
): Match {
  const reviewed = reviews.filter((r) => r.raceKey === entry.raceKey)
  const candidates: Match[] = []
  for (const review of reviewed) {
    const market = snapshot.markets[review.ticker]
    const event =
      market && snapshot.events.find((e) => e.ticker === market.eventTicker)
    if (
      !market ||
      !event ||
      review.manifestIdentity !== manifestIdentity(entry) ||
      review.marketIdentity !== marketIdentity(market, event)
    )
      continue
    if (!/approved/i.test(entry.yesMeaning))
      throw new Error(`Unexpected YES meaning: ${entry.raceKey}`)
    const base = {
      tickers: [market.ticker],
      eventTickers: [event.ticker],
      matching: [
        review.evidence,
        `Reviewed direction: source YES = ${review.direction}; Manifold YES = voter approval`,
      ],
    }
    const quote = usableQuote(market)
    if ('reason' in quote) {
      candidates.push({ ...base, status: 'thin', reason: quote.reason })
      continue
    }
    // A reference binary's NO is the complement of YES, not another portfolio
    // measure. Normalizing that pair preserves the midpoint without mixing measures.
    const approval =
      review.direction === 'approval' ? quote.price : 100 - quote.price
    candidates.push({
      ...base,
      status: 'usable',
      reason:
        'Normalized complementary YES/NO; approval direction; clamped to 1-99%',
      proposed: [Math.round(Math.max(1, Math.min(99, approval)) * 10) / 10],
      prices: [{ ticker: market.ticker, answer: 0, ...quote }],
    })
  }
  candidates.sort(
    (a, b) =>
      (a.status === 'usable' ? 0 : 1) - (b.status === 'usable' ? 0 : 1) ||
      (snapshot.markets[b.tickers[0]].volume ?? 0) -
        (snapshot.markets[a.tickers[0]].volume ?? 0)
  )
  return (
    candidates[0] ?? {
      status: 'unmatched',
      tickers: reviewed.map((r) => r.ticker),
      reason: reviewed.length
        ? 'Reviewed market missing or identity changed; manual rematch required'
        : 'No reviewed exact state + designation + subject + election + approval-direction match',
    }
  )
}

type Edit = { keys: (string | number)[]; value: unknown; decimal?: boolean }
// Surgical JSON edits preserve every byte outside the permitted value spans,
// including the entire already-created Rhode Island entry.
export function patchJson(text: string, edits: Edit[]): string {
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  for (const { keys, value, decimal } of edits) {
    const tree = ts.parseJsonText('manifest.json', text)
    const root = (tree.statements[0] as ts.ExpressionStatement).expression
    let node: ts.Node = root
    for (const key of keys.slice(0, -1)) {
      if (typeof key === 'number' && ts.isArrayLiteralExpression(node))
        node = node.elements[key]
      else if (ts.isObjectLiteralExpression(node)) {
        const prop = node.properties.find(
          (p) =>
            ts.isPropertyAssignment(p) &&
            ts.isStringLiteral(p.name) &&
            p.name.text === key
        ) as ts.PropertyAssignment | undefined
        if (!prop) throw new Error(`Missing JSON path: ${keys.join('.')}`)
        node = prop.initializer
      } else throw new Error(`Invalid JSON path: ${keys.join('.')}`)
    }
    if (!ts.isObjectLiteralExpression(node))
      throw new Error('JSON edit parent must be an object')
    const key = keys[keys.length - 1]
    const prop = node.properties.find(
      (p) =>
        ts.isPropertyAssignment(p) &&
        ts.isStringLiteral(p.name) &&
        p.name.text === key
    ) as ts.PropertyAssignment | undefined
    const location = prop
      ? prop.getStart(tree)
      : node.properties[0]?.getStart(tree) ?? node.getStart(tree) + 1
    const lineStart = text.lastIndexOf('\n', location) + 1
    const indent = text.slice(lineStart, location).match(/^\s*/)?.[0] ?? ''
    const json = decimal
      ? Array.isArray(value)
        ? `[${value.map((x) => Number(x).toFixed(1)).join(', ')}]`
        : Number(value).toFixed(1)
      : JSON.stringify(value, null, 2).replace(/\n/g, eol + indent)
    if (prop)
      text =
        text.slice(0, prop.initializer.getStart(tree)) +
        json +
        text.slice(prop.initializer.end)
    else {
      const last = node.properties[node.properties.length - 1]
      if (!last) throw new Error('Cannot append to empty metadata object')
      text =
        text.slice(0, last.end) +
        ',' +
        eol +
        indent +
        JSON.stringify(key) +
        ': ' +
        json +
        text.slice(last.end)
    }
  }
  JSON.parse(text)
  return text
}
export function reseed(
  raw: string,
  snapshot: Snapshot,
  reviews: Review[],
  now: string
) {
  const manifest: Json = JSON.parse(raw)
  const edits: Edit[] = []
  const rows: Row[] = []
  manifest.entries.forEach((entry: Json, i: number) => {
    const old =
      entry.payload?.answerProbs ??
      (entry.payload?.initialProb !== undefined
        ? [entry.payload.initialProb]
        : [])
    const office = entry.measure ? 'ballot' : entry.identity.office
    const match: Match =
      entry.raceKey === RI
        ? {
            status: 'preserved',
            tickers: [],
            reason:
              'Already-created RI governor entry left byte-for-byte unchanged',
          }
        : entry.status !== 'ready'
        ? { status: 'held', tickers: [], reason: 'Held entry; no seed refresh' }
        : office === 'house'
        ? matchHouse(entry, snapshot)
        : office === 'ballot'
        ? matchBallot(entry, snapshot, reviews)
        : { status: 'unmatched', tickers: [], reason: 'Unsupported office' }
    const next = match.proposed ?? old
    rows.push({
      ...match,
      raceKey: entry.raceKey,
      office,
      old,
      next,
      labels: entry.payload?.answers ?? ['Approval'],
      liquidityTier: entry.payload?.liquidityTier ?? 0,
    })
    if (entry.raceKey === RI) return
    if (match.status === 'usable') {
      edits.push({
        keys: [
          'entries',
          i,
          'payload',
          office === 'ballot' ? 'initialProb' : 'answerProbs',
        ],
        value: office === 'ballot' ? next[0] : next,
        decimal: true,
      })
      edits.push({
        keys: ['entries', i, 'seed', 'basis'],
        value: `Public market order-book seed fetched ${snapshot.fetchedAt}; ${
          match.reason
        }. ${match.tickers.join(
          ', '
        )}. Seed, not a guaranteed forecast; Source settlement criteria may differ. See market-seed-mapping.json for identity and direction evidence.`,
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
    } else
      edits.push({
        keys: ['entries', i, 'seed', 'source'],
        value: { kind: 'existing' },
      })
  })
  const date = now.slice(0, 10)
  const version = manifest.manifestVersion.startsWith(date + '.')
    ? Number(manifest.manifestVersion.slice(date.length + 1)) + 1
    : 1
  const note = `Market-price seed refresh ${now}: usable prices replaced starting seeds where an exact match passed the quote checks. Tod must review market-reseed-report.md and approve this manifest again before creation.`
  edits.push(
    { keys: ['manifestVersion'], value: `${date}.${Math.max(2, version)}` },
    { keys: ['generatedAt'], value: now },
    { keys: ['review', 'approved'], value: false },
    {
      keys: ['review', 'notes'],
      value:
        (manifest.review.notes ?? '').replace(
          /\nMarket-price seed refresh[^\n]*/g,
          ''
        ) +
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
    delete m.review.approved
    delete m.review.notes
    for (const e of m.entries) {
      if (e.raceKey === RI) continue
      if (e.payload) {
        delete e.payload.answerProbs
        delete e.payload.initialProb
      }
      delete e.seed.basis
      delete e.seed.source
    }
    return JSON.stringify(m)
  }
  if (strip(before) !== strip(after))
    throw new Error('A non-seed manifest field changed')
  const riSpan = (raw: string) => {
    const start = raw.indexOf('"raceKey": "' + RI + '"')
    if (start < 0) return ''
    const end = raw.indexOf('\n    },', start)
    return raw.slice(start, end)
  }
  if (riSpan(before) !== riSpan(after))
    throw new Error('Rhode Island bytes changed')
}

const vector = (values: number[]) => values.map((x) => x.toFixed(1)).join(' / ')
const tableCell = (value: string) =>
  value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
export function makeReport(rows: Row[], snapshot: Snapshot): string {
  const lines = [
    '# Election starting-price review',
    '',
    `Fetched: ${snapshot.fetchedAt}. Public unauthenticated GETs only. Prices below are cents.`,
    '',
    'Both manifests require re-approval. Liquidity tiers, payload descriptions, existing markets and the entire Rhode Island entry are unchanged.',
    '',
    '| Coverage (ready entries) | Usable | Matched but thin | Unmatched |',
    '|---|---:|---:|---:|',
  ]
  for (const office of ['house', 'ballot']) {
    const group = rows.filter(
      (r) => r.office === office && !['held', 'preserved'].includes(r.status)
    )
    lines.push(
      `| ${office} (${group.length}) | ${
        group.filter((r) => r.status === 'usable').length
      } | ${group.filter((r) => r.status === 'thin').length} | ${
        group.filter((r) => r.status === 'unmatched').length
      } |`
    )
  }
  lines.push(
    '',
    '## 25 largest changes',
    '',
    'Largest absolute change to any answer; vectors follow the manifest answer order.',
    '',
    '| Race | Old → new (%) | Ticker; bid / ask; volume |',
    '|---|---|---|'
  )
  const delta = (r: Row) =>
    Math.max(0, ...r.old.map((v, i) => Math.abs(v - r.next[i])))
  for (const r of rows
    .filter((r) => delta(r) > 0)
    .sort((a, b) => delta(b) - delta(a))
    .slice(0, 25)) {
    const quotes = r.tickers
      .map((t) => {
        const m = snapshot.markets[t]
        return `${t}: ${m.yesBid ?? '—'} / ${m.yesAsk ?? '—'}; ${
          m.volume ?? '—'
        }`
      })
      .join('; ')
    lines.push(
      `| ${r.raceKey} | ${vector(r.old)} → ${vector(r.next)} | ${quotes} |`
    )
  }
  const house = rows.filter(
    (r) => r.office === 'house' && r.old.length && r.status !== 'held'
  )
  lines.push(
    '',
    '## House favourite distribution',
    '',
    '| Favourite | Before | After |',
    '|---|---:|---:|'
  )
  for (const [low, high] of [
    [0, 60],
    [60, 70],
    [70, 85],
    [85, 95],
    [95, 98],
    [98, 100],
  ]) {
    const count = (key: 'old' | 'next') =>
      house.filter(
        (r) => Math.max(...r[key]) >= low && Math.max(...r[key]) < high
      ).length
    lines.push(`| ${low}–<${high}% | ${count('old')} | ${count('next')} |`)
  }
  lines.push(
    '',
    '## Every House race retaining its old seed',
    '',
    'Grouped by seed vector. Includes usable prices that round to the original value; reasons distinguish these from thin/unmatched markets.'
  )
  const groups = new Map<string, Row[]>()
  for (const r of house.filter((r) => delta(r) < 1e-8)) {
    const key = vector(r.old)
    groups.set(key, [...(groups.get(key) ?? []), r])
  }
  for (const [seed, group] of [...groups].sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    lines.push('', `### ${seed}% (${group.length})`, '')
    group.forEach((r) => lines.push(`- ${r.raceKey}: ${r.status}; ${r.reason}`))
  }
  lines.push(
    '',
    '## Tier threshold crossings (no tiers changed)',
    '',
    '| Race | Favourite before → after | Current tier → suggested tier | Budget delta |',
    '|---|---|---|---:|'
  )
  let budgetDelta = 0
  for (const r of house.filter(
    (r) => Math.max(...r.old) >= 85 !== Math.max(...r.next) >= 85
  )) {
    const tier = Math.max(...r.next) >= 85 ? 1000 : 10000
    budgetDelta += tier - r.liquidityTier
    lines.push(
      `| ${r.raceKey} | ${Math.max(...r.old)} → ${Math.max(...r.next)} | ${
        r.liquidityTier
      } → ${tier} | ${tier - r.liquidityTier} |`
    )
  }
  lines.push(
    '',
    `Retiering only these crossings would change the race budget by ${budgetDelta} mana (${
      306000 + budgetDelta
    } races; ${
      408000 + budgetDelta
    } combined). Current budgets remain 306,000 / 102,000 planned spend.`,
    '',
    '## Thin and unmatched ready entries',
    '',
    '| Race | Status | Reason | Tickers |',
    '|---|---|---|---|'
  )
  rows
    .filter((r) => ['thin', 'unmatched'].includes(r.status))
    .forEach((r) =>
      lines.push(
        `| ${r.raceKey} | ${r.status} | ${tableCell(
          r.reason
        )} | ${r.tickers.join(', ')} |`
      )
    )
  lines.push('', '## One-sided quote exceptions', '')
  const flagged = rows.flatMap((r) =>
    (r.prices ?? [])
      .filter((p) => p.flag)
      .map((p) => `${r.raceKey}: ${p.ticker}; ${p.flag}; price ${p.price}c`)
  )
  lines.push(...(flagged.length ? flagged.map((s) => '- ' + s) : ['None.']))
  lines.push(
    '',
    '## Method, scope and API differences',
    '',
    '- Live API prices use *_dollars; volumes/open interest use *_fp. Both modern and legacy fields are supported. Price fields in snapshots and sources are normalized to cents.',
    '- Discovery reads the full series catalogue (House races are in Elections, not just Politics), then paginates events and markets. Tickers are discovered, not assumed from memory. Requests are serialized at least 300ms apart, with 429/5xx backoff.',
    '- Two-sided spreads must be at most 10c. Missing quotes are thin except the flagged 0–2c long-shot exception and its complementary 98–100c form. Last trades are recorded, never substituted for quotes.',
    '- House prices are normalized across mutually exclusive outcomes. Other has a 1% floor even when the source does not list an Other outcome. Three-answer seeds cannot exceed 98%; two-answer seeds can reach 99%.',
    '- There are 219 three-party House entries, four Democratic/Other entries and one same-party candidate entry. A party event cannot price the two candidates separately.',
    '- The reference House contracts refer to the member sworn in for the 2027 term, while these Manifold markets resolve on the certified election winner. Prices are a starting reference, not proof of identical settlement.',
    '- Ballot identities and approval/failure direction were reviewed by state, designation and subject in market-seed-review.json. Exact identity hashes must still match on every refresh; changed or new ambiguous identities stay unmatched. No fuzzy matching. Dates in 2027 expiration fields are not treated as election dates.',
    '- Ballot YES/NO are complementary outcomes of one measure; different measures in the same event are never normalized together.',
    '- Held entries retain seeds and remain held. The already-created RI governor entry is untouched. Unusable/unmatched seeds remain unchanged and are marked source.kind=existing.',
    '- Descriptions and seed.note were frozen as requested. Some still describe original partisan-lean/poll/50% seeds; the updated seed.basis and seed.source are authoritative for this refresh. Resolve that wording separately before publication if desired.',
    '- Both manifests have new versions/timestamps and review.approved=false. No liquidity tier, market identity, reserved ID, candidate, description, close time or dashboard mapping is changed.',
    '',
    '## Refresh',
    '',
    'From backend/scripts: `npx ts-node --transpile-only elections-2026/market-seeds.ts --check` previews without writing; omit `--check` to refresh snapshots, mapping, manifests and this report. Read the report before re-approving either manifest.',
    ''
  )
  return lines.join('\n')
}

export async function main(args = process.argv.slice(2)) {
  const check = args.includes('--check')
  const snapshotIndex = args.indexOf('--snapshot')
  const allowed = new Set(['--check', '--snapshot'])
  for (let i = 0; i < args.length; i++) {
    if (!allowed.has(args[i])) throw new Error(`Unknown option ${args[i]}`)
    if (args[i] === '--snapshot') {
      if (!args[++i] || args[i].startsWith('--'))
        throw new Error('--snapshot requires a saved snapshot path')
    }
  }
  const snapshot: Snapshot =
    snapshotIndex >= 0
      ? JSON.parse(fs.readFileSync(args[snapshotIndex + 1], 'utf8'))
      : await discover()
  if (
    snapshot.apiBase !== API_BASE ||
    !snapshot.fetchedAt ||
    !Array.isArray(snapshot.events) ||
    !snapshot.markets
  )
    throw new Error('Invalid public market-price snapshot')
  const reviewData = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'market-seed-review.json'), 'utf8')
  )
  const reviews: Review[] = reviewData.matches
  const now = new Date().toISOString()
  const manifests = ['manifest.json', 'ballot-measures/manifest.json'].map(
    (name) => {
      const file = path.join(__dirname, name)
      return {
        file,
        ...reseed(fs.readFileSync(file, 'utf8'), snapshot, reviews, now),
      }
    }
  )
  const rows = manifests.flatMap((m) => m.rows)
  for (const row of rows) {
    const rejection = reviewData.rejections?.find(
      (r: { raceKeys: string[]; reason: string }) =>
        r.raceKeys.includes(row.raceKey)
    )
    if (row.status === 'unmatched' && rejection) row.reason = rejection.reason
  }
  const mapping = {
    fetchedAt: snapshot.fetchedAt,
    markets: Object.fromEntries(rows.map((r) => [r.raceKey, r])),
  }
  const report = makeReport(rows, snapshot)
  if (check) process.stdout.write(report)
  else {
    const write = (name: string, data: unknown) =>
      fs.writeFileSync(
        path.join(__dirname, name),
        (JSON.stringify(data, null, 2) + '\n').replace(/\n/g, '\r\n')
      )
    write('market-price-snapshot.json', snapshot)
    write('market-seed-mapping.json', mapping)
    fs.writeFileSync(
      path.join(__dirname, 'market-reseed-report.md'),
      report.replace(/\n/g, '\r\n')
    )
    manifests.forEach((m) => fs.writeFileSync(m.file, m.output))
  }
  process.stdout.write(
    JSON.stringify(
      {
        mode: check ? 'check (no writes)' : 'local seed refresh',
        fetchedAt: snapshot.fetchedAt,
        offlineSnapshot: snapshotIndex >= 0,
        coverage: Object.fromEntries(
          ['house', 'ballot'].map((office) => [
            office,
            Object.fromEntries(
              ['usable', 'thin', 'unmatched'].map((status) => [
                status,
                rows.filter((r) => r.office === office && r.status === status)
                  .length,
              ])
            ),
          ])
        ),
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
