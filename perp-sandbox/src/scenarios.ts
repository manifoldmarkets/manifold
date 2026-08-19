/** The four scenarios. Each returns a printable report. */

import {
  bookStats,
  cloneState,
  leverageAsymmetryBook,
  loadSnapshot,
  snapshotToState,
} from './book'
import {
  getPerpOpenInterest,
  getPositionValue,
  PerpState,
  PERP_OPEN_INTEREST_COVER_MULTIPLE,
} from './common'
import {
  compoundedDrag,
  FundingParams,
  fundingRateFor,
  ImbalanceInput,
  imbalanceRatio,
  rateAtRatio,
} from './model'
import {
  flatPath,
  NO_FLOW,
  PeriodRecord,
  rampPath,
  runSim,
  SimParams,
  SimResult,
  TradeFlow,
} from './sim'
import {
  fmtBps,
  fmtMana,
  fmtNum,
  fmtPct,
  fmtRatio,
  fmtSign,
  heading,
  sparkline,
  subheading,
  table,
} from './format'

export type ScenarioOptions = {
  k: number
  fMax: number
  exponent: number
  periods: number
  periodHours: number
  takerFeeBps: number
  flow: TradeFlow
  price?: number
  sampleEvery?: number
}

const paramsFor = (
  o: ScenarioOptions,
  imbalanceInput: ImbalanceInput
): FundingParams => ({
  k: o.k,
  fMax: o.fMax,
  exponent: o.exponent,
  imbalanceInput,
})

const MODELS: { key: ImbalanceInput; label: string }[] = [
  { key: 'pool', label: 'POOL-derived (prod today)' },
  { key: 'openInterest', label: 'OI-derived (PR #3985)' },
]

/** Per-period rate expressed as compounded drag over a day. */
const dailyDrag = (rate: number, periodHours: number) =>
  compoundedDrag(rate, 24 / periodHours)

// ────────────────────────────────────────────────────────────────────────────
// Shared: the margin-vs-notional distortion, which every scenario inherits.
// ────────────────────────────────────────────────────────────────────────────

const marginVsNotionalNote = (
  state: PerpState,
  rate: number,
  periodHours: number
): string => {
  const live = state.positions.filter((p) => p.size > 0)
  if (!live.length || rate === 0) return ''
  const f = Math.abs(rate)
  const MARGIN = 1000
  const levs = [1, 5, 25, 100]
  const perDay = 24 / periodHours

  // Held constant: margin. So the funding paid is IDENTICAL down the column,
  // while the exposure it buys scales with leverage.
  const rows = levs.map((lev) => [
    `${lev}x`,
    fmtMana(MARGIN),
    fmtMana(MARGIN * lev),
    fmtMana(f * MARGIN),
    fmtBps((f * MARGIN) / (MARGIN * lev), 5),
    fmtPct(compoundedDrag((f * MARGIN) / (MARGIN * lev), perDay), 4),
  ])

  const maxLev = Math.max(...live.map((p) => p.leverage))
  const wtd =
    live.reduce((s, p) => s + p.leverage * p.size, 0) /
    live.reduce((s, p) => s + p.size, 0)

  return [
    subheading('Funding is charged on MARGIN, not notional'),
    `Same M$${MARGIN} of margin at four leverages, at the current rate ` +
      `(${fmtBps(rate)} bps/period):`,
    '',
    table(
      [
        { header: 'leverage' },
        { header: 'margin' },
        { header: 'notional' },
        { header: 'pays/period' },
        { header: 'bps of notional' },
        { header: '%/day on notional' },
      ],
      rows
    ),
    '',
    'The "pays/period" column is constant: cost of carry is invariant to the',
    'exposure being carried. Priced against notional — the thing funding is',
    'supposed to be balancing — the 100x position is charged 1/100th the rate',
    'of the 1x one.',
    '',
    `This book runs up to ${fmtNum(maxLev, 0)}x with a notional-weighted mean ` +
      `of ${fmtNum(wtd, 1)}x, so the distortion is not hypothetical here: the`,
    'positions driving open-interest imbalance are the ones paying least to',
    'correct it. Known issue, deliberately not modelled as fixed.',
  ].join('\n')
}

// ────────────────────────────────────────────────────────────────────────────
// Scenario 1 — live book, flat oracle, both models side by side
// ────────────────────────────────────────────────────────────────────────────

const simSummaryRows = (
  res: SimResult,
  o: ScenarioOptions,
  sampleEvery: number
): string[][] =>
  res.records
    .filter((r) => r.period % sampleEvery === 0 || r.period === 1)
    .map((r) => [
      `${r.period}`,
      fmtRatio(r.ratio),
      fmtBps(r.rate),
      fmtSign(r.rate),
      fmtMana(
        r.rate > 0
          ? r.cumulativeTransferLongPays
          : r.cumulativeTransferShortPays
      ),
      fmtMana(r.long.openInterest),
      fmtMana(r.long.limit),
      fmtPct(r.long.utilization, 1),
      fmtMana(r.long.headroom),
      fmtMana(r.short.headroom),
    ])

export const scenario1 = (o: ScenarioOptions): string => {
  const snap = loadSnapshot()
  const state = snapshotToState(snap)
  const price = o.price ?? snap.oraclePrice
  const stats = bookStats(state, price)
  const sampleEvery = o.sampleEvery ?? Math.max(1, Math.round(24 / o.periodHours))
  const out: string[] = []

  out.push(heading('SCENARIO 1 — live BTC book, flat oracle, both models'))
  out.push(
    `Snapshot ${snap.pulledAt} · contract ${snap.contractId} · price ${fmtNum(
      price
    )}`
  )
  out.push(
    `k=${o.k}  f_max=${o.fMax} (${fmtBps(o.fMax)} bps/period)  p=${
      o.exponent
    }  period=${o.periodHours}h  horizon=${o.periods} periods (${fmtNum(
      (o.periods * o.periodHours) / 24,
      1
    )} days)`
  )
  out.push('')
  out.push(
    table(
      [
        { header: 'side', align: 'left' },
        { header: 'positions' },
        { header: 'open interest' },
        { header: 'margin (pool)' },
        { header: 'unrealized' },
      ],
      [
        [
          'long',
          `${stats.numLong}`,
          fmtMana(stats.oiLong),
          fmtMana(snap.poolLong),
          fmtMana(stats.unrealizedLong),
        ],
        [
          'short',
          `${stats.numShort}`,
          fmtMana(stats.oiShort),
          fmtMana(snap.poolShort),
          fmtMana(stats.unrealizedShort),
        ],
      ]
    )
  )
  out.push('')
  out.push(
    `Leverage: min ${fmtNum(stats.leverageMin, 2)}x · median ${fmtNum(
      stats.leverageMedian,
      2
    )}x · mean ${fmtNum(stats.leverageMean, 2)}x · notional-weighted ${fmtNum(
      stats.leverageWeighted,
      2
    )}x`
  )

  const poolRatio = imbalanceRatio(state, 'pool')
  const oiRatio = imbalanceRatio(state, 'openInterest')
  const poolRate = fundingRateFor(state, paramsFor(o, 'pool'))
  const oiRate = fundingRateFor(state, paramsFor(o, 'openInterest'))

  out.push('')
  out.push(subheading('Opening rate under each model'))
  out.push(
    table(
      [
        { header: 'model', align: 'left' },
        { header: 'ratio' },
        { header: 'crowded side', align: 'left' },
        { header: 'rate (bps)' },
        { header: 'direction', align: 'left' },
        { header: '%/day' },
      ],
      [
        [
          'pool',
          fmtRatio(poolRatio),
          snap.poolLong > snap.poolShort ? 'long' : 'short',
          fmtBps(poolRate),
          fmtSign(poolRate),
          fmtPct(dailyDrag(poolRate, o.periodHours)),
        ],
        [
          'open interest',
          fmtRatio(oiRatio),
          stats.oiLong > stats.oiShort ? 'long' : 'short',
          fmtBps(oiRate),
          fmtSign(oiRate),
          fmtPct(dailyDrag(oiRate, o.periodHours)),
        ],
      ]
    )
  )
  if (poolRate * oiRate < 0) {
    out.push('')
    out.push(
      '*** The two models DISAGREE ON SIGN on the live book. Pool says ' +
        `${fmtSign(poolRate)}, open interest says ${fmtSign(oiRate)}. ***`
    )
  }

  const results: { label: string; res: SimResult }[] = []
  for (const m of MODELS) {
    const sim: SimParams = {
      funding: paramsFor(o, m.key),
      periods: o.periods,
      price: flatPath(price),
      takerFeeBps: o.takerFeeBps,
      flow: o.flow,
      contractId: snap.contractId,
    }
    const res = runSim(state, sim)
    results.push({ label: m.label, res })

    out.push('')
    out.push(subheading(m.label))
    out.push(
      table(
        [
          { header: 'period' },
          { header: 'ratio' },
          { header: 'rate bps' },
          { header: 'dir', align: 'left' },
          { header: 'cum transfer' },
          { header: 'long OI' },
          { header: 'long cap' },
          { header: 'long util' },
          { header: 'long room' },
          { header: 'short room' },
        ],
        simSummaryRows(res, o, sampleEvery)
      )
    )
    const last = res.records[res.records.length - 1]
    out.push('')
    out.push(
      `Total moved: ${fmtMana(
        Math.max(res.totalLongPays, res.totalShortPays)
      )} (${
        res.totalLongPays > res.totalShortPays ? 'longs paid' : 'shorts paid'
      }) · liquidations ${res.totalLiquidated} · ADL periods ${
        res.totalAdlPeriods
      } · blocked ${res.blockedPeriods}${
        res.totalRejectedOpens
          ? ` · flow opens refused at the cap ${res.totalRejectedOpens}`
          : ''
      }`
    )
    out.push(
      `Long capacity utilisation ${fmtPct(
        res.records[0].long.utilization,
        1
      )} → ${fmtPct(last.long.utilization, 1)}   ` +
        sparkline(res.records.map((r) => r.long.utilization))
    )
  }

  out.push('')
  out.push(subheading('Side by side — long-side headroom (the binding one)'))
  const [poolRes, oiRes] = results.map((r) => r.res)
  const cmpRows = poolRes.records
    .filter((r) => r.period % sampleEvery === 0 || r.period === 1)
    .map((r, i) => {
      const o2 = oiRes.records.filter(
        (x) => x.period % sampleEvery === 0 || x.period === 1
      )[i]
      return [
        `${r.period}`,
        fmtBps(r.rate),
        fmtPct(r.long.utilization, 1),
        fmtMana(r.long.headroom),
        fmtBps(o2.rate),
        fmtPct(o2.long.utilization, 1),
        fmtMana(o2.long.headroom),
      ]
    })
  out.push(
    table(
      [
        { header: 'period' },
        { header: 'pool bps' },
        { header: 'pool util' },
        { header: 'pool room' },
        { header: 'OI bps' },
        { header: 'OI util' },
        { header: 'OI room' },
      ],
      cmpRows
    )
  )

  const note = marginVsNotionalNote(state, oiRate, o.periodHours)
  if (note) out.push(note)
  return out.join('\n')
}

// ────────────────────────────────────────────────────────────────────────────
// Scenario 2 — parameter sweep
// ────────────────────────────────────────────────────────────────────────────

const SWEEP_K = [0.5, 1, 2, 3, 5, 8, 12, 20]
const SWEEP_FMAX_MULT = [1, 2, 5, 10, 20, 50]
const PROBE_RATIOS = [1.2, 1.5, 2, 3, 4, 5, 10]

export const scenario2 = (o: ScenarioOptions): string => {
  const snap = loadSnapshot()
  const state = snapshotToState(snap)
  const out: string[] = []
  const periodsPerDay = 24 / o.periodHours

  out.push(heading('SCENARIO 2 — k and f_max sweep'))
  out.push(
    `Base f_max = ${o.fMax} (${fmtBps(o.fMax)} bps/period). Cells are ` +
      `COMPOUNDED %/day paid by the crowded side at that imbalance ratio.`
  )
  out.push(
    `Period ${o.periodHours}h → ${periodsPerDay} funding events/day. p=${o.exponent}.`
  )

  out.push('')
  out.push(subheading('Shape of I(r) alone (independent of f_max)'))
  out.push(
    table(
      [{ header: 'k', align: 'left' }, ...PROBE_RATIOS.map((r) => ({ header: `r=${r}` }))],
      SWEEP_K.map((k) => [
        `${k}`,
        ...PROBE_RATIOS.map((r) =>
          fmtPct(rateAtRatio(r, { k, fMax: 1, exponent: o.exponent, imbalanceInput: 'pool' }), 1)
        ),
      ])
    )
  )
  out.push('(as a fraction of f_max — 100% means the cap is reached)')

  for (const mult of SWEEP_FMAX_MULT) {
    const fMax = o.fMax * mult
    out.push('')
    out.push(
      subheading(
        `f_max = ${mult}x base = ${fMax.toExponential(3)} (${fmtBps(
          fMax
        )} bps/period, cap ${fmtPct(compoundedDrag(fMax, periodsPerDay), 2)}/day)`
      )
    )
    out.push(
      table(
        [
          { header: 'k', align: 'left' },
          ...PROBE_RATIOS.map((r) => ({ header: `r=${r}` })),
          { header: 'bite 4x/1.2x' },
        ],
        SWEEP_K.map((k) => {
          const params: FundingParams = {
            k,
            fMax,
            exponent: o.exponent,
            imbalanceInput: 'pool',
          }
          const drag = (r: number) =>
            compoundedDrag(rateAtRatio(r, params), periodsPerDay)
          const d12 = drag(1.2)
          const d4 = drag(4)
          return [
            `${k}`,
            ...PROBE_RATIOS.map((r) => fmtPct(drag(r), 3)),
            d12 > 0 ? fmtNum(d4 / d12, 1) : '∞',
          ]
        })
      )
    )
  }

  out.push('')
  out.push(subheading('Live BTC book under each combination (OI-derived)'))
  const liveRatio = imbalanceRatio(state, 'openInterest')
  out.push(`Current OI ratio ${fmtRatio(liveRatio)}.`)
  out.push('')
  out.push(
    table(
      [
        { header: 'k', align: 'left' },
        ...SWEEP_FMAX_MULT.map((m) => ({ header: `${m}x f_max` })),
      ],
      SWEEP_K.map((k) => [
        `${k}`,
        ...SWEEP_FMAX_MULT.map((mult) =>
          fmtPct(
            compoundedDrag(
              fundingRateFor(state, {
                k,
                fMax: o.fMax * mult,
                exponent: o.exponent,
                imbalanceInput: 'openInterest',
              }),
              periodsPerDay
            ),
            3
          )
        ),
      ])
    )
  )

  return out.join('\n')
}

// ────────────────────────────────────────────────────────────────────────────
// Scenario 3 — leverage asymmetry
// ────────────────────────────────────────────────────────────────────────────

export const scenario3 = (o: ScenarioOptions): string => {
  const snap = loadSnapshot()
  const price = o.price ?? snap.oraclePrice
  // eps lifts cover off exactly zero without moving the pool ratio; see the
  // note printed at the end of this scenario.
  const COVER_EPS = 1e-6
  const state = leverageAsymmetryBook({
    numLongs: 100,
    longMargin: 100,
    longLeverage: 50,
    shortMargin: 500_000,
    shortLeverage: 1,
    price,
    coverEpsilon: COVER_EPS,
  })
  const stats = bookStats(state, price)
  const out: string[] = []

  out.push(heading('SCENARIO 3 — leverage asymmetry, balanced exposure'))
  out.push(
    '100 longs × M$100 margin at 50x  vs  1 short × M$500,000 margin at 1x.'
  )
  out.push('Identical notional on each side. Pools differ 50:1.')
  out.push('')
  out.push(
    table(
      [
        { header: 'side', align: 'left' },
        { header: 'positions' },
        { header: 'notional (OI)' },
        { header: 'margin (pool)' },
        { header: 'leverage' },
      ],
      [
        [
          'long',
          `${stats.numLong}`,
          fmtMana(stats.oiLong),
          fmtMana(state.pool.L),
          '50x',
        ],
        [
          'short',
          `${stats.numShort}`,
          fmtMana(stats.oiShort),
          fmtMana(state.pool.S),
          '1x',
        ],
      ]
    )
  )

  out.push('')
  out.push(subheading('What each model charges'))
  const rows: string[][] = []
  for (const m of MODELS) {
    const params = paramsFor(o, m.key)
    const rate = fundingRateFor(state, params)
    const ratio = imbalanceRatio(state, m.key)
    const payerPool = rate > 0 ? state.pool.L : state.pool.S
    const transfer = Math.abs(rate) * payerPool
    rows.push([
      m.label,
      fmtRatio(ratio),
      fmtBps(rate),
      fmtSign(rate),
      fmtMana(transfer),
      fmtPct(dailyDrag(rate, o.periodHours)),
    ])
  }
  out.push(
    table(
      [
        { header: 'model', align: 'left' },
        { header: 'ratio' },
        { header: 'rate bps' },
        { header: 'direction', align: 'left' },
        { header: 'transfer/period' },
        { header: "payer's %/day" },
      ],
      rows
    )
  )

  const poolRate = fundingRateFor(state, paramsFor(o, 'pool'))
  const oiRate = fundingRateFor(state, paramsFor(o, 'openInterest'))

  out.push('')
  out.push(subheading('Reading it'))
  if (oiRate === 0) {
    out.push(
      'OI-derived: exposure is exactly balanced, so the rate is ZERO. Nothing'
    )
    out.push('is transferred, which is the economically correct answer here.')
  }
  if (poolRate !== 0) {
    const payerIsShort = poolRate < 0
    const payerPool = payerIsShort ? state.pool.S : state.pool.L
    const transfer = Math.abs(poolRate) * payerPool
    const perDay = transfer * (24 / o.periodHours)
    out.push('')
    out.push(
      `Pool-derived: reads a ${fmtRatio(
        imbalanceRatio(state, 'pool')
      )} imbalance that does not exist in exposure terms, and charges the`
    )
    out.push(
      `${payerIsShort ? 'SHORT' : 'LONG'} side ${fmtMana(
        transfer
      )}/period — ${fmtMana(perDay)}/day, ${fmtMana(
        perDay * 30
      )} over 30 days.`
    )
    out.push(
      `That is ${fmtPct(
        compoundedDrag(poolRate, (24 / o.periodHours) * 30)
      )} of the payer's margin in a month IF the rate held — it decays as the`
    )
    out.push(
      'transfer erodes the ratio, so see the simulated figure below. Either way'
    )
    out.push(
      'the short is charged for carrying the same exposure as the side'
    )
    out.push(
      'receiving it, and it is the side providing all the backing cover.'
    )
  }

  out.push('')
  out.push(subheading('Per-trader economics under the pool model, 30 days'))
  const periodsPerDay = 24 / o.periodHours
  const horizon = periodsPerDay * 30
  const sim = runSim(state, {
    funding: paramsFor(o, 'pool'),
    periods: horizon,
    price: flatPath(price),
    takerFeeBps: o.takerFeeBps,
    flow: NO_FLOW,
    contractId: 'synthetic-asymmetry',
  })
  const finalShort = sim.finalState.positions.find(
    (p) => p.userId === 'whale-short'
  )
  const finalLong = sim.finalState.positions.find((p) => p.userId === 'long-1')
  const startShort = state.positions.find((p) => p.userId === 'whale-short')!
  const startLong = state.positions.find((p) => p.userId === 'long-1')!
  out.push(
    table(
      [
        { header: 'trader', align: 'left' },
        { header: 'margin t0' },
        { header: 'margin t30d' },
        { header: 'change' },
        { header: 'notional t0' },
        { header: 'notional t30d' },
      ],
      [
        [
          'whale short (1x)',
          fmtMana(startShort.costBasis),
          fmtMana(finalShort?.costBasis ?? 0),
          fmtPct(
            ((finalShort?.costBasis ?? 0) - startShort.costBasis) /
              startShort.costBasis
          ),
          fmtMana(startShort.size),
          fmtMana(finalShort?.size ?? 0),
        ],
        [
          'one long (50x)',
          fmtMana(startLong.costBasis),
          fmtMana(finalLong?.costBasis ?? 0),
          fmtPct(
            ((finalLong?.costBasis ?? 0) - startLong.costBasis) /
              startLong.costBasis
          ),
          fmtMana(startLong.size),
          fmtMana(finalLong?.size ?? 0),
        ],
      ]
    )
  )
  out.push('')
  out.push(
    `Total moved over 30 days: ${fmtMana(
      Math.max(sim.totalLongPays, sim.totalShortPays)
    )} · liquidations ${sim.totalLiquidated} · blocked periods ${
      sim.blockedPeriods
    }`
  )
  out.push(
    "Note the short's notional shrinks with its margin: the haircut scales"
  )
  out.push('size and cost basis together, so it also loses exposure it paid for.')

  // Side finding, surfaced because it is prod's own assert, not the sandbox's.
  const knife = leverageAsymmetryBook({
    numLongs: 100,
    longMargin: 100,
    longLeverage: 50,
    shortMargin: 500_000,
    shortLeverage: 1,
    price,
    coverEpsilon: 0,
  })
  const knifeSim = runSim(knife, {
    funding: paramsFor(o, 'pool'),
    periods: 4,
    price: flatPath(price),
    takerFeeBps: o.takerFeeBps,
    flow: NO_FLOW,
    contractId: 'synthetic-asymmetry',
  })
  const firstBlock = knifeSim.records.find((r) => r.blocked)
  if (firstBlock) {
    out.push(subheading('Side finding: funding aborts on a zero-cover book'))
    out.push(
      `Built with pools exactly equal to each side's margin (cover == 0 on both`
    )
    out.push(
      `sides, which is what a book looks like when nobody has PnL yet), this`
    )
    out.push(
      `same scenario blocks at period ${firstBlock.period}:`
    )
    out.push(`  ${firstBlock.blocked}`)
    out.push('')
    out.push(
      'Cause: funding scales each position individually and each pool in'
    )
    out.push(
      'aggregate. Those two float paths disagree by ~1 ulp, so cover lands at'
    )
    out.push(
      '-1e-12 instead of 0. solvencyFactor\'s E<=0 branch is a bare'
    )
    out.push(
      '`availableCover >= 0` test, so it returns -Infinity, and'
    )
    out.push(
      'assertPerpStateSolvent throws on the non-finite check BEFORE its 1e-12'
    )
    out.push(
      'tolerance is ever consulted (amm.ts:717 and :795). The no-profit case is'
    )
    out.push(
      'therefore checked with zero tolerance; the has-profit case is not.'
    )
    out.push('')
    out.push(
      'Not reachable on BTC today (cover is 48.9k long / 34.9k short). The'
    )
    out.push(
      'exposed shape is a FRESH market: everyone opens, price has not moved, so'
    )
    out.push(
      'one side has no unrealized profit and its pool exactly equals its'
    )
    out.push(
      'margins. Worth a look given the UK carbon freeze was the same family of'
    )
    out.push('failure. The main table above uses a 1e-6 ratio-preserving cover')
    out.push('epsilon to stand in for accumulated fees and get past it.')
  }

  return out.join('\n')
}

// ────────────────────────────────────────────────────────────────────────────
// Scenario 4 — stress path
// ────────────────────────────────────────────────────────────────────────────

export const scenario4 = (o: ScenarioOptions): string => {
  const snap = loadSnapshot()
  const state = snapshotToState(snap)
  const startPrice = o.price ?? snap.oraclePrice
  const dropPct = 0.1
  const endPrice = startPrice * (1 - dropPct)
  const dropPeriods = Math.round(48 / o.periodHours)
  const periods = Math.max(o.periods, dropPeriods * 2)
  const out: string[] = []

  out.push(heading('SCENARIO 4 — stress: oracle −10% over 48h'))
  out.push(
    `${fmtNum(startPrice)} → ${fmtNum(endPrice)} linearly over ${dropPeriods} ` +
      `periods (${o.periodHours}h each), then flat to period ${periods}.`
  )

  const results: { key: ImbalanceInput; label: string; res: SimResult }[] = []
  for (const m of MODELS) {
    const res = runSim(state, {
      funding: paramsFor(o, m.key),
      periods,
      price: rampPath(startPrice, endPrice, dropPeriods),
      takerFeeBps: o.takerFeeBps,
      flow: o.flow,
      contractId: snap.contractId,
    })
    results.push({ key: m.key, label: m.label, res })
  }

  for (const { label, res } of results) {
    out.push('')
    out.push(subheading(label))
    const interesting = res.records.filter(
      (r) =>
        r.numLiquidated > 0 ||
        r.adlFactorLong < 1 ||
        r.adlFactorShort < 1 ||
        r.blocked ||
        r.period % Math.max(1, Math.round(dropPeriods / 8)) === 0
    )
    out.push(
      table(
        [
          { header: 'period' },
          { header: 'price' },
          { header: 'ratio' },
          { header: 'rate bps' },
          { header: 'dir', align: 'left' },
          { header: 'liq' },
          { header: 'liq notional' },
          { header: 'ADL long' },
          { header: 'ADL short' },
          { header: 'long room' },
          { header: 'note', align: 'left' },
        ],
        interesting
          .slice(0, 40)
          .map((r) => [
            `${r.period}`,
            fmtNum(r.price, 0),
            fmtRatio(r.ratio),
            fmtBps(r.rate),
            fmtSign(r.rate),
            `${r.numLiquidated}`,
            fmtMana(r.liquidatedNotional),
            r.adlFactorLong < 1 ? fmtNum(r.adlFactorLong, 4) : '—',
            r.adlFactorShort < 1 ? fmtNum(r.adlFactorShort, 4) : '—',
            fmtMana(r.long.headroom),
            r.blocked ? r.blocked.slice(0, 40) : '',
          ])
      )
    )
    out.push('')
    out.push(
      `Liquidations ${res.totalLiquidated} · periods with ADL ${
        res.totalAdlPeriods
      } · ADL settlements paid ${fmtMana(
        res.totalAdlSettledPayout
      )} · blocked ${res.blockedPeriods} · funding moved ${fmtMana(
        Math.max(res.totalLongPays, res.totalShortPays)
      )}`
    )
  }

  // −10% turns out not to reach ADL under either model, so sweep the move
  // depth in both directions to find where the two models actually separate.
  out.push('')
  out.push(subheading('Move-depth sweep — where does ADL actually start?'))
  out.push(
    `Each row: same 48h ramp to the stated move, then held flat to period ${
      dropPeriods * 5
    }.`
  )
  out.push('')
  const MOVES = [-0.5, -0.4, -0.3, -0.2, -0.1, 0.1, 0.2, 0.3, 0.4, 0.5]
  const sweepRows = MOVES.map((move) => {
    const target = startPrice * (1 + move)
    const cells = MODELS.map((m) => {
      const res = runSim(state, {
        funding: paramsFor(o, m.key),
        periods: dropPeriods * 5,
        price: rampPath(startPrice, target, dropPeriods),
        takerFeeBps: o.takerFeeBps,
        flow: o.flow,
        contractId: snap.contractId,
      })
      const worst = Math.min(
        ...res.records.map((r) => Math.min(r.adlFactorLong, r.adlFactorShort))
      )
      return {
        liq: res.totalLiquidated,
        adl: res.totalAdlPeriods,
        worst,
        blocked: res.blockedPeriods,
        moved: Math.max(res.totalLongPays, res.totalShortPays),
      }
    })
    const [pool, oi] = cells
    return [
      `${(move * 100).toFixed(0)}%`,
      fmtNum(target, 0),
      `${pool.liq}`,
      `${pool.adl}`,
      pool.worst < 1 ? fmtNum(pool.worst, 4) : '—',
      `${pool.blocked}`,
      `${oi.liq}`,
      `${oi.adl}`,
      oi.worst < 1 ? fmtNum(oi.worst, 4) : '—',
      `${oi.blocked}`,
    ]
  })
  out.push(
    table(
      [
        { header: 'move', align: 'left' },
        { header: 'price' },
        { header: 'P:liq' },
        { header: 'P:ADL' },
        { header: 'P:worst' },
        { header: 'P:blk' },
        { header: 'OI:liq' },
        { header: 'OI:ADL' },
        { header: 'OI:worst' },
        { header: 'OI:blk' },
      ],
      sweepRows
    )
  )
  out.push('P: = pool-derived, OI: = open-interest-derived. ADL = periods with')
  out.push('a factor below 1; worst = smallest factor seen; blk = aborted ticks.')
  out.push('')
  out.push('Reading it: on the DOWNSIDE the two models are indistinguishable.')
  out.push('On the UPSIDE they separate hard, and the reason is mechanical.')
  out.push('')
  out.push(
    'Longs winning must be paid out of the SHORT pool. Today the short pool is'
  )
  out.push(
    'the larger one, so the pool model reads shorts as crowded and drains the'
  )
  out.push(
    'short pool to pay longs — removing cover from the exact side that has to'
  )
  out.push(
    'fund the winners, which is what pulls the ADL factor under 1. On open'
  )
  out.push(
    'interest longs are the crowded side, so funding flows INTO the short pool'
  )
  out.push('and cover is topped up as the liability grows.')
  out.push('')
  out.push(
    'So the honest answer to "does OI-derived make ADL more or less likely":'
  )
  out.push(
    'no measurable change when the price falls, and a large reduction when it'
  )
  out.push('rises. It never made ADL more likely anywhere on this sweep.')

  out.push('')
  out.push(subheading('Does the funding model change ADL exposure?'))
  const [poolRes, oiRes] = results.map((r) => r.res)
  const minAdl = (res: SimResult, side: 'long' | 'short') =>
    Math.min(
      ...res.records.map((r) =>
        side === 'long' ? r.adlFactorLong : r.adlFactorShort
      )
    )
  out.push(
    table(
      [
        { header: 'metric', align: 'left' },
        { header: 'pool-derived' },
        { header: 'OI-derived' },
        { header: 'difference', align: 'left' },
      ],
      [
        [
          'liquidations',
          `${poolRes.totalLiquidated}`,
          `${oiRes.totalLiquidated}`,
          `${oiRes.totalLiquidated - poolRes.totalLiquidated}`,
        ],
        [
          'periods with ADL',
          `${poolRes.totalAdlPeriods}`,
          `${oiRes.totalAdlPeriods}`,
          `${oiRes.totalAdlPeriods - poolRes.totalAdlPeriods}`,
        ],
        [
          'worst ADL factor (long)',
          fmtNum(minAdl(poolRes, 'long'), 4),
          fmtNum(minAdl(oiRes, 'long'), 4),
          '',
        ],
        [
          'worst ADL factor (short)',
          fmtNum(minAdl(poolRes, 'short'), 4),
          fmtNum(minAdl(oiRes, 'short'), 4),
          '',
        ],
        [
          'funding moved',
          fmtMana(Math.max(poolRes.totalLongPays, poolRes.totalShortPays)),
          fmtMana(Math.max(oiRes.totalLongPays, oiRes.totalShortPays)),
          '',
        ],
        [
          'blocked periods',
          `${poolRes.blockedPeriods}`,
          `${oiRes.blockedPeriods}`,
          '',
        ],
        [
          'final short pool',
          fmtMana(poolRes.finalState.pool.S),
          fmtMana(oiRes.finalState.pool.S),
          '',
        ],
        [
          'final long pool',
          fmtMana(poolRes.finalState.pool.L),
          fmtMana(oiRes.finalState.pool.L),
          '',
        ],
      ]
    )
  )

  return out.join('\n')
}

/** Capacity mechanics explainer, printed with scenario 1. */
export const capacityNote = (): string => {
  const snap = loadSnapshot()
  const state = snapshotToState(snap)
  const price = snap.oraclePrice
  const oi = getPerpOpenInterest(state.positions)
  const reservedShort = state.positions
    .filter((p) => p.direction === 'short' && p.size > 0)
    .reduce((s, p) => s + Math.min(p.costBasis, getPositionValue(p, price)), 0)
  const reservedLong = state.positions
    .filter((p) => p.direction === 'long' && p.size > 0)
    .reduce((s, p) => s + Math.min(p.costBasis, getPositionValue(p, price)), 0)
  return [
    subheading('Where capacity comes from'),
    `cover(long)  = poolShort ${fmtMana(snap.poolShort)} − reserved short ` +
      `value ${fmtMana(reservedShort)} = ${fmtMana(
        snap.poolShort - reservedShort
      )}`,
    `cover(short) = poolLong  ${fmtMana(snap.poolLong)} − reserved long  ` +
      `value ${fmtMana(reservedLong)} = ${fmtMana(
        snap.poolLong - reservedLong
      )}`,
    `limit = ${PERP_OPEN_INTEREST_COVER_MULTIPLE}x cover · long OI ${fmtMana(
      oi.long
    )} vs limit ${fmtMana(
      Math.max(snap.poolShort - reservedShort, 0) *
        PERP_OPEN_INTEREST_COVER_MULTIPLE
    )} · short OI ${fmtMana(oi.short)} vs limit ${fmtMana(
      Math.max(snap.poolLong - reservedLong, 0) *
        PERP_OPEN_INTEREST_COVER_MULTIPLE
    )}`,
    '',
    'A new position adds its own margin to its own pool, and reserves exactly',
    'that much against itself on the opposing side. Net new cover: zero. So',
    'capacity only moves through funding transfers, taker fees, and opposing',
    'positions losing value (their reserve shrinks to min(costBasis, value)).',
  ].join('\n')
}
