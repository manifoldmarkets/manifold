/**
 * Local web UI for the sandbox.
 *
 * The browser NEVER computes funding. Every number on the page is produced
 * here, in Node, by the same imported `common/src/perps/*` functions the CLI
 * uses — the page just draws what this returns. That keeps the one rule the
 * sandbox exists to enforce: no second implementation of the math.
 *
 * No dependencies: node:http only. `web/index.html` is read from disk per
 * request, so editing it and hitting refresh is enough — no restart, no build.
 */

import * as http from 'http'
import * as fs from 'fs'
import * as path from 'path'
import {
  bookStats,
  leverageAsymmetryBook,
  loadSnapshot,
  snapshotToState,
} from './book'
import {
  getPerpOpenInterest,
  getPerpOpenInterestCapacity,
  PerpState,
  PERP_OPEN_INTEREST_COVER_MULTIPLE,
} from './common'
import {
  driftAnalysis,
  equilibriumAnalysis,
  pathwayGrid,
  shockResponse,
  subsidyLadder,
} from './pathways'
import { loadDaily, replayWindow, sigmaBands } from './history'
import { AssetAssumption, DEFAULT_ASSETS, designMarket } from './design'
import { applyLeverageCap, feeEconomics, houseView, loadBuckets } from './house'
import { DEFAULT_HOUSE_PARAMS, runHouseSim } from './house-sim'
import {
  compoundedDrag,
  FundingParams,
  fundingRateFor,
  ImbalanceInput,
  imbalanceRatio,
  rateAtRatio,
} from './model'
import {
  escrowView,
  flatPath,
  rampPath,
  runSim,
  SimResult,
  TradeFlow,
} from './sim'
import { validate } from './validate'
import {
  capacityNote,
  scenario1,
  scenario2,
  scenario3,
  scenario4,
  ScenarioOptions,
} from './scenarios'

const PORT = Number(process.env.PORT ?? 5178)
const WEB_DIR = path.join(__dirname, '..', 'web')

type SimRequest = {
  k: number
  fMax: number
  exponent: number
  periods: number
  periodHours: number
  takerFeeBps: number
  book: 'btc' | 'asymmetry'
  movePct: number
  moveOverPeriods: number
  flow: TradeFlow
  asym: {
    numLongs: number
    longMargin: number
    longLeverage: number
    shortMargin: number
    shortLeverage: number
  }
}

const MODELS: { key: ImbalanceInput; id: 'pool' | 'oi' }[] = [
  { key: 'pool', id: 'pool' },
  { key: 'openInterest', id: 'oi' },
]

const buildBook = (req: SimRequest, price: number): PerpState => {
  if (req.book === 'asymmetry') {
    return leverageAsymmetryBook({
      ...req.asym,
      price,
      coverEpsilon: 1e-6,
    })
  }
  return snapshotToState(loadSnapshot())
}

/** Keep the payload small: never ship more than ~240 points per series. */
const downsample = <T>(rows: T[], max = 240): T[] => {
  if (rows.length <= max) return rows
  const stride = rows.length / max
  const out: T[] = []
  for (let i = 0; i < max; i++) out.push(rows[Math.floor(i * stride)])
  const last = rows[rows.length - 1]
  if (out[out.length - 1] !== last) out.push(last)
  return out
}

const summarise = (res: SimResult, periodHours: number) => ({
  series: downsample(res.records).map((r) => ({
    p: r.period,
    price: r.price,
    rate: r.rate,
    ratio: Number.isFinite(r.ratio) ? r.ratio : null,
    util: Number.isFinite(r.long.utilization) ? r.long.utilization : null,
    utilShort: Number.isFinite(r.short.utilization) ? r.short.utilization : null,
    headroom: Number.isFinite(r.long.headroom) ? r.long.headroom : null,
    headroomShort: Number.isFinite(r.short.headroom) ? r.short.headroom : null,
    cum: Math.max(
      r.cumulativeTransferLongPays,
      r.cumulativeTransferShortPays
    ),
    poolLong: r.poolLong,
    poolShort: r.poolShort,
    liq: r.numLiquidated,
    adlL: r.adlFactorLong,
    adlS: r.adlFactorShort,
    blocked: r.blocked ?? null,
  })),
  totals: {
    longPays: res.totalLongPays,
    shortPays: res.totalShortPays,
    liquidations: res.totalLiquidated,
    adlPeriods: res.totalAdlPeriods,
    adlSettled: res.totalAdlSettledPayout,
    blocked: res.blockedPeriods,
    rejectedOpens: res.totalRejectedOpens,
    periodHours,
  },
})

const runBoth = (req: SimRequest) => {
  const snap = loadSnapshot()
  const price = snap.oraclePrice
  const state = buildBook(req, price)
  const target = price * (1 + req.movePct / 100)
  const pricePath =
    req.movePct === 0
      ? flatPath(price)
      : rampPath(price, target, Math.max(1, req.moveOverPeriods))

  const out: Record<string, unknown> = {}
  for (const m of MODELS) {
    const funding: FundingParams = {
      k: req.k,
      fMax: req.fMax,
      exponent: req.exponent,
      imbalanceInput: m.key,
    }
    const res = runSim(state, {
      funding,
      periods: req.periods,
      price: pricePath,
      takerFeeBps: req.takerFeeBps,
      flow: req.flow,
      contractId: snap.contractId,
    })
    const rate0 = fundingRateFor(state, funding)
    out[m.id] = {
      ...summarise(res, req.periodHours),
      opening: {
        ratio: Number.isFinite(imbalanceRatio(state, m.key))
          ? imbalanceRatio(state, m.key)
          : null,
        rate: rate0,
        pctDay: compoundedDrag(rate0, 24 / req.periodHours),
        payer: rate0 > 0 ? 'long' : rate0 < 0 ? 'short' : 'none',
      },
    }
  }

  const stats = bookStats(state, price)
  const oi = getPerpOpenInterest(state.positions)
  return {
    price,
    endPrice: target,
    book: {
      ...stats,
      poolLong: state.pool.L,
      poolShort: state.pool.S,
      oiLong: oi.long,
      oiShort: oi.short,
      poolRatio: imbalanceRatio(state, 'pool'),
      oiRatio: imbalanceRatio(state, 'openInterest'),
    },
    ...out,
  }
}

const runSweep = (body: {
  ks: number[]
  fMaxMults: number[]
  baseFMax: number
  exponent: number
  periodHours: number
  ratio: number
}) => {
  const periodsPerDay = 24 / body.periodHours
  const grid = body.ks.map((k) =>
    body.fMaxMults.map((mult) => {
      const params: FundingParams = {
        k,
        fMax: body.baseFMax * mult,
        exponent: body.exponent,
        imbalanceInput: 'pool',
      }
      const drag = (r: number) =>
        compoundedDrag(rateAtRatio(r, params), periodsPerDay)
      const at12 = drag(1.2)
      return {
        k,
        mult,
        atRatio: drag(body.ratio),
        at12,
        at4: drag(4),
        bite: at12 > 0 ? drag(4) / at12 : null,
      }
    })
  )
  // Curve for the currently-selected f_max multiplier of 1.
  const curve: { r: number; drag: number }[] = []
  for (let r = 1; r <= 10.0001; r += 0.05) {
    curve.push({
      r: Number(r.toFixed(2)),
      drag: compoundedDrag(
        rateAtRatio(r, {
          k: body.ks[0],
          fMax: body.baseFMax,
          exponent: body.exponent,
          imbalanceInput: 'pool',
        }),
        periodsPerDay
      ),
    })
  }
  return { grid, curve }
}

const optionsFor = (req: SimRequest): ScenarioOptions => ({
  k: req.k,
  fMax: req.fMax,
  exponent: req.exponent,
  periods: req.periods,
  periodHours: req.periodHours,
  takerFeeBps: req.takerFeeBps,
  flow: req.flow,
})

const send = (
  res: http.ServerResponse,
  code: number,
  type: string,
  body: string | Buffer
) => {
  res.writeHead(code, {
    'content-type': type,
    'cache-control': 'no-store',
  })
  res.end(body)
}

const json = (res: http.ServerResponse, data: unknown) =>
  send(res, 200, 'application/json; charset=utf-8', JSON.stringify(data))

const readBody = (req: http.IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (c) => {
      raw += c
      if (raw.length > 1e6) reject(new Error('body too large'))
    })
    req.on('end', () => resolve(raw))
    req.on('error', reject)
  })

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)
  try {
    if (url.pathname === '/' || url.pathname === '/index.html') {
      const html = fs.readFileSync(path.join(WEB_DIR, 'index.html'))
      return send(res, 200, 'text/html; charset=utf-8', html)
    }

    if (url.pathname === '/api/init') {
      const snap = loadSnapshot()
      const state = snapshotToState(snap)
      const rep = validate()
      return json(res, {
        snapshot: {
          pulledAt: snap.pulledAt,
          contractId: snap.contractId,
          slug: snap.slug,
          oraclePrice: snap.oraclePrice,
          k: snap.fundingSensitivity,
          fMax: snap.maxFundingRate,
          periodHours: snap.fundingPeriodMs / 3_600_000,
          maxLeverage: snap.maxLeverage,
          storedFundingRate: snap.storedFundingRate,
        },
        book: {
          ...bookStats(state, snap.oraclePrice),
          poolLong: snap.poolLong,
          poolShort: snap.poolShort,
          poolRatio: imbalanceRatio(state, 'pool'),
          oiRatio: imbalanceRatio(state, 'openInterest'),
        },
        validation: {
          passed: rep.passed,
          total: rep.rows.length,
          matchingAtCurrentConfig: rep.matchingAtCurrentConfig,
          maxRelErrorHistoric: rep.maxRelErrorHistoric,
          configChange: rep.configChange,
          live: rep.live,
          rows: rep.rows.map((r) => ({
            ts: r.ts,
            poolLong: r.poolLong,
            poolShort: r.poolShort,
            stored: r.stored,
            recomputed: r.atHistoricConfig,
            relError: r.relErrorHistoric,
            fMaxUsed: r.fMaxUsed,
          })),
        },
      })
    }

    if (url.pathname === '/api/sim' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req)) as SimRequest
      return json(res, runBoth(body))
    }

    if (url.pathname === '/api/sweep' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req))
      return json(res, runSweep(body))
    }

    if (url.pathname === '/api/pathways' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req)) as SimRequest & {
        input: ImbalanceInput
        moves: number[]
      }
      const snap = loadSnapshot()
      const price = snap.oraclePrice
      const state = buildBook(body, price)
      const perDay = Math.max(1, Math.round(24 / body.periodHours))
      return json(
        res,
        pathwayGrid({
          state,
          price,
          funding: {
            k: body.k,
            fMax: body.fMax,
            exponent: body.exponent,
            imbalanceInput: body.input,
          },
          moves: body.moves,
          horizons: [
            { periods: perDay, days: 1, label: '1 day' },
            { periods: perDay * 7, days: 7, label: '7 days' },
            { periods: perDay * 30, days: 30, label: '30 days' },
            { periods: perDay * 90, days: 90, label: '90 days' },
          ],
          rampPeriods: perDay * 2,
          takerFeeBps: body.takerFeeBps,
          flow: body.flow,
          contractId: snap.contractId,
        })
      )
    }

    if (url.pathname === '/api/drift' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req)) as SimRequest & {
        annualDriftPct: number
        subsidies: number[]
        splitToLong: number
      }
      const snap = loadSnapshot()
      const price = snap.oraclePrice
      const state = buildBook(body, price)
      const params: FundingParams = {
        k: body.k,
        fMax: body.fMax,
        exponent: body.exponent,
        imbalanceInput: 'openInterest',
      }
      const cap = getPerpOpenInterestCapacity('long', state, price)
      const analysis = driftAnalysis({
        state,
        price,
        params,
        annualDriftPct: body.annualDriftPct,
        periodHours: body.periodHours,
        leverages: [1, 2, 5, 10, 25, 50, 100],
        maxLongOi: cap.limit,
      })
      // Break-even leverage: where drift-on-notional exactly eats f_max.
      const breakEvenLeverage =
        analysis.driftPerPeriod > 0
          ? params.fMax / analysis.driftPerPeriod
          : Infinity
      // The same, at a realistic imbalance rather than the unreachable cap.
      const atRatio = (r: number) =>
        analysis.driftPerPeriod > 0
          ? rateAtRatio(r, params) / analysis.driftPerPeriod
          : Infinity
      return json(res, {
        ...analysis,
        breakEvenLeverage,
        breakEvenAtRatio: [1.5, 2, 3, 5, 10].map((r) => ({
          r,
          leverage: atRatio(r),
        })),
        fMaxAnnualisedPct:
          params.fMax * ((365 * 24) / body.periodHours) * 100,
        maxLeverage: snap.maxLeverage,
        subsidy: subsidyLadder({
          state,
          price,
          amounts: body.subsidies,
          splitToLong: body.splitToLong,
          annualDriftPct: body.annualDriftPct,
          coverMultiple: PERP_OPEN_INTEREST_COVER_MULTIPLE,
        }),
      })
    }

    if (url.pathname === '/api/shock' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req)) as SimRequest & {
        movePct: number
        days: number
        input: ImbalanceInput
      }
      const snap = loadSnapshot()
      const price = snap.oraclePrice
      const state = buildBook(body, price)
      const perDay = Math.max(1, Math.round(24 / body.periodHours))
      const periods = Math.max(1, Math.round(perDay * body.days))
      return json(
        res,
        shockResponse({
          state,
          price,
          movePct: body.movePct,
          periods,
          rampPeriods: periods,
          base: {
            k: body.k,
            fMax: body.fMax,
            exponent: body.exponent,
            imbalanceInput: body.input,
          },
          ks: [0.5, 1, 3, 10],
          fMaxMultiples: [1, 10, 100],
          subsidies: [0, 50_000, 100_000, 250_000, 500_000],
          takerFeeBps: body.takerFeeBps,
          flow: body.flow,
          contractId: snap.contractId,
        })
      )
    }

    if (url.pathname === '/api/replay' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req)) as SimRequest & {
        days: number
        input: ImbalanceInput
        invert: boolean
      }
      const snap = loadSnapshot()
      const price = snap.oraclePrice
      const state = buildBook(body, price)
      const daily = loadDaily()
      const funding: FundingParams = {
        k: body.k,
        fMax: body.fMax,
        exponent: body.exponent,
        imbalanceInput: body.input,
      }
      const maxStart = daily.px.length - body.days - 1
      const starts = [
        maxStart,
        ...[0, 0.2, 0.4, 0.6, 0.8].map((f) => Math.floor(maxStart * f)),
      ]
      const windows = starts.map((s, i) =>
        replayWindow({
          state,
          startPrice: price,
          daily,
          startIndex: s,
          days: body.days,
          label: i === 0 ? 'most recent' : `from ${s}d in`,
          funding,
          takerFeeBps: body.takerFeeBps,
          flow: body.flow,
          contractId: snap.contractId,
          invert: body.invert,
          sampleTo: 200,
        })
      )
      return json(res, {
        feed: {
          id: daily.feedId,
          first: daily.first,
          last: daily.last,
          n: daily.n,
          vol: daily.realizedVol,
        },
        bands: sigmaBands(daily.realizedVol.sdHourly, [
          { label: '1 hour', hours: 1 },
          { label: '1 day', hours: 24 },
          { label: '1 week', hours: 24 * 7 },
          { label: '30 days', hours: 24 * 30 },
          { label: '90 days', hours: 24 * 90 },
        ]),
        baseBuffer: escrowView(state, price).buffer,
        windows,
        invert: body.invert,
      })
    }

    if (url.pathname === '/api/equilibrium' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req)) as SimRequest & {
        annualDriftPct: number
        longLeverage: number
        shortLeverage: number
      }
      return json(
        res,
        equilibriumAnalysis({
          params: {
            k: body.k,
            fMax: body.fMax,
            exponent: body.exponent,
            imbalanceInput: 'openInterest',
          },
          annualDriftPct: body.annualDriftPct,
          periodHours: body.periodHours,
          longLeverage: body.longLeverage,
          shortLeverage: body.shortLeverage,
          ratios: [1.2, 1.5, 2, 3, 4, 5, 9, 19],
          targetShortShares: [10, 20, 30, 40],
        })
      )
    }

    if (url.pathname === '/api/design' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req)) as SimRequest & {
        assets: AssetAssumption[]
        sigmas: number
        targetLongEdgePct: number
      }
      const params: FundingParams = {
        k: body.k,
        fMax: body.fMax,
        exponent: body.exponent,
        imbalanceInput: 'openInterest',
      }
      return json(res, {
        fMaxAnnualPct: params.fMax * ((365 * 24) / body.periodHours) * 100,
        results: (body.assets ?? DEFAULT_ASSETS).map((asset) =>
          designMarket({
            asset,
            params,
            periodHours: body.periodHours,
            sigmas: body.sigmas,
            targetLongEdgePct: body.targetLongEdgePct,
          })
        ),
      })
    }

    if (url.pathname === '/api/house' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req)) as { feeBps: number }
      const book = loadBuckets()
      return json(res, {
        pulledAt: book.pulledAt,
        oraclePrice: book.oraclePrice,
        view: houseView(book),
        caps: [100, 50, 25, 20, 10, 5].map((c) => applyLeverageCap(book, c)),
        fees: [body.feeBps, 20, 30, 50].map((b) => feeEconomics(book, b)),
        volumeDays: book.organicVolume.days,
      })
    }

    if (url.pathname === '/api/burn' && req.method === 'POST') {
      const over = JSON.parse(await readBody(req))
      const base = { ...DEFAULT_HOUSE_PARAMS, ...over }
      const main = runHouseSim(base)
      const variants: [string, Partial<typeof base>][] = [
        ['baseline', {}],
        ['fee 20 bps', { feeBps: 20 }],
        ['fee 30 bps', { feeBps: 30 }],
        ['turnover halves', { dailyTurnover: base.dailyTurnover / 2 }],
        ['turnover doubles', { dailyTurnover: base.dailyTurnover * 2 }],
        ['net OI 17% (funding fix)', { netOiFraction: 0.17 }],
        ['traders +1.5 bps (observed)', { traderEdgeBps: 1.5 }],
        ['traders +5 bps', { traderEdgeBps: 5 }],
        ['traders +10 bps', { traderEdgeBps: 10 }],
      ]
      return json(res, {
        main,
        scaling: [base.subsidy, 250000, 500000, 1000000, 2000000].map((sub) => {
          const x = runHouseSim({ ...base, subsidy: sub, paths: 600 })
          return { subsidy: sub, mean: x.mean, sd: x.sdPnl, probAhead: x.probAhead, ratio: x.ratio }
        }),
        sensitivities: variants.map(([label, o]) => {
          const x = runHouseSim({ ...base, ...o, paths: 600 })
          return { label, mean: x.mean, probAhead: x.probAhead, probRuin: x.probRuin, ratio: x.ratio }
        }),
      })
    }

    if (url.pathname === '/api/report' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req)) as SimRequest & {
        scenario: string
      }
      const o = optionsFor(body)
      const text =
        body.scenario === '1'
          ? `${scenario1(o)}\n${capacityNote()}`
          : body.scenario === '2'
          ? scenario2(o)
          : body.scenario === '3'
          ? scenario3(o)
          : scenario4(o)
      return json(res, { text })
    }

    send(res, 404, 'text/plain; charset=utf-8', 'not found')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const stack = error instanceof Error ? error.stack ?? '' : ''
    // Surface the failure in the UI rather than leaving a spinner hanging —
    // a thrown assert from common/ is itself a result worth seeing.
    json(res, { error: message, stack })
  }
})

server.listen(PORT, () => {
  console.log(`\n  perp funding sandbox — http://localhost:${PORT}\n`)
  console.log(`  Serving ${WEB_DIR}`)
  console.log(`  All math runs here in Node, imported from common/src/perps/*.`)
  console.log(`  Edit web/index.html and refresh; no restart needed.\n`)
})
