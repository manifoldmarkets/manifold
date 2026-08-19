#!/usr/bin/env ts-node
/**
 * perp-funding-sandbox — model Manifold's perp funding using the production
 * math, without touching production.
 *
 *   yarn sim validate            gate check against prod's own funding events
 *   yarn sim book                the live BTC book as loaded
 *   yarn sim 1 | 2 | 3 | 4       scenarios
 *   yarn sim all                 everything
 *   yarn sim rate --input oi     one-off rate for the live book
 */

import {
  bookStats,
  loadSnapshot,
  snapshotToState,
} from './book'
import {
  getPerpOpenInterestCapacity,
  getPerpTakerFeeBps,
  PERP_TAKER_FEE_BPS_DEFAULT,
} from './common'
import {
  driftAnalysis,
  equilibriumAnalysis,
  pathwayGrid,
  shockResponse,
} from './pathways'
import { loadDaily, replayWindow, sigmaBands } from './history'
import { DEFAULT_ASSETS, designMarket } from './design'
import { applyLeverageCap, feeEconomics, houseView, loadBuckets } from './house'
import { DEFAULT_HOUSE_PARAMS, runHouseSim, signalToNoise } from './house-sim'
import { compoundedDrag, fundingRateFor, ImbalanceInput, imbalanceRatio } from './model'
import {
  capacityNote,
  scenario1,
  scenario2,
  scenario3,
  scenario4,
  ScenarioOptions,
} from './scenarios'
import { validate } from './validate'
import { printDiagnosis } from './diagnose'
import {
  fmtBps,
  fmtMana,
  fmtNum,
  fmtPct,
  fmtRatio,
  fmtSign,
  heading,
  subheading,
  table,
} from './format'

type Args = { _: string[]; flags: Record<string, string> }

const parseArgs = (argv: string[]): Args => {
  const out: Args = { _: [], flags: {} }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const eq = a.indexOf('=')
      if (eq > -1) out.flags[a.slice(2, eq)] = a.slice(eq + 1)
      else if (i + 1 < argv.length && !argv[i + 1].startsWith('--'))
        out.flags[a.slice(2)] = argv[++i]
      else out.flags[a.slice(2)] = 'true'
    } else out._.push(a)
  }
  return out
}

const num = (flags: Record<string, string>, key: string, fallback: number) => {
  const raw = flags[key]
  if (raw === undefined) return fallback
  const v = Number(raw)
  if (!Number.isFinite(v)) {
    console.error(`--${key} must be a finite number, got "${raw}"`)
    process.exit(1)
  }
  return v
}

const USAGE = `
perp-funding-sandbox

COMMANDS
  validate            replay prod's stored funding events through common/'s math
  diagnose            solve each stored event for the k / f_max that produced it
  book                summarise the loaded BTC book
  1 | 2 | 3 | 4       run a scenario
  all                 validate + all four scenarios
  rate                print the current rate under both models

PARAMETERS
  --k <n>             fundingSensitivity        (default: contract's, 1)
  --fmax <n>          maxFundingRate per period (default: contract's, 0.000228)
  --exponent <p>      convexity on I: I^p       (default 1 = current model)
  --periods <n>       periods to simulate       (default 720)
  --period-hours <n>  hours per funding period  (default 1)
  --taker-fee-bps <n> taker fee on open         (default ${PERP_TAKER_FEE_BPS_DEFAULT})
  --price <n>         oracle price              (default: snapshot's)
  --input <pool|oi>   imbalance source for 'rate'
  --sample <n>        row sampling in scenario 1 (default: one per day)
  --flow-long <mana>  new margin opened long each period   (default 0)
  --flow-short <mana> new margin opened short each period  (default 0)
  --flow-lev-long <x>  leverage for that flow    (default 5)
  --flow-lev-short <x> leverage for that flow    (default 5)

EXAMPLES
  yarn sim 1 --k 5 --fmax 0.001
  yarn sim 2 --period-hours 8
  yarn sim 1 --exponent 2          convex curve, deadband near balance
  yarn sim 4 --flow-long 500 --taker-fee-bps 25
`

const optionsFrom = (args: Args): ScenarioOptions => {
  const snap = loadSnapshot()
  const { flags } = args
  return {
    k: num(flags, 'k', snap.fundingSensitivity),
    fMax: num(flags, 'fmax', snap.maxFundingRate),
    exponent: num(flags, 'exponent', num(flags, 'p', 1)),
    periods: num(flags, 'periods', 720),
    periodHours: num(flags, 'period-hours', 1),
    takerFeeBps: num(
      flags,
      'taker-fee-bps',
      getPerpTakerFeeBps({ takerFeeBps: snap.takerFeeBps ?? undefined })
    ),
    price: flags.price ? num(flags, 'price', snap.oraclePrice) : undefined,
    sampleEvery: flags.sample ? num(flags, 'sample', 24) : undefined,
    flow: {
      marginLong: num(flags, 'flow-long', 0),
      marginShort: num(flags, 'flow-short', 0),
      leverageLong: num(flags, 'flow-lev-long', 5),
      leverageShort: num(flags, 'flow-lev-short', 5),
    },
  }
}

const printValidation = (): boolean => {
  const rep = validate()
  console.log(heading('VALIDATION — sandbox vs production'))
  console.log(
    `Replaying ${rep.rows.length} stored funding events through ` +
      `computeFundingRate() imported from common/src/perps/amm.ts,`
  )
  console.log("using each event's own recorded pre-transfer POOL balances.")
  console.log('')
  console.log(
    table(
      [
        { header: 'event', align: 'left' },
        { header: 'poolLong' },
        { header: 'poolShort' },
        { header: 'prod stored' },
        { header: 'recomputed' },
        { header: 'f_max used' },
        { header: 'rel error' },
      ],
      rep.rows
        .slice(-8)
        .map((r) => [
          r.ts,
          fmtMana(r.poolLong),
          fmtMana(r.poolShort),
          r.stored.toExponential(12),
          r.atHistoricConfig.toExponential(12),
          r.fMaxUsed.toExponential(4),
          r.relErrorHistoric.toExponential(2),
        ])
    )
  )
  console.log('')
  console.log(`(last 8 of ${rep.rows.length} shown)`)
  console.log(
    `At today's config alone: ${rep.matchingAtCurrentConfig}/${rep.rows.length}` +
      ` events reproduce (max rel error ${rep.maxRelErrorCurrent.toExponential(
        2
      )}).`
  )
  if (rep.configChange) {
    console.log(
      `The rest are explained by a live config change at ${rep.configChange.at}:` +
        ` f_max ${rep.configChange.from.toExponential(
          6
        )} → ${rep.configChange.to.toExponential(6)}`
    )
    console.log(
      `  (the earlier value is recovered from the events themselves — it is` +
        ` 1/8760 to 7 s.f., i.e. 100%/yr charged hourly; k solves to 1` +
        ` throughout, so only f_max moved)`
    )
  }
  console.log(
    `Applying the config in force at each event: max rel error ` +
      `${rep.maxRelErrorHistoric.toExponential(3)}`
  )
  console.log('')
  console.log(
    rep.passed
      ? `PASS — all ${rep.rows.length} events reproduce to float round-off. The ` +
          "sandbox is running prod's funding math, and prod's funding is " +
          'POOL-derived.'
      : `FAIL — worst mismatch at ${rep.worstHistoric.ts}: stored ` +
          `${rep.worstHistoric.stored}, recomputed ` +
          `${rep.worstHistoric.atHistoricConfig}. STOP: the sandbox does not ` +
          'reproduce production and its output cannot be trusted.'
  )
  const lastEvent = rep.rows[rep.rows.length - 1]
  console.log(
    `\nThe event that stamped the contract's current fundingRate ` +
      `(${lastEvent.ts}) reproduces from the POOL ratio with relative error ` +
      `${lastEvent.relErrorHistoric.toExponential(2)}.`
  )

  const { live } = rep
  console.log(subheading('Live contract fundingRate field'))
  console.log(
    table(
      [
        { header: 'source', align: 'left' },
        { header: 'long input' },
        { header: 'short input' },
        { header: 'rate' },
        { header: 'dir', align: 'left' },
        { header: 'matches stored', align: 'left' },
      ],
      [
        [
          'stored on contract',
          '',
          '',
          live.storedRate.toExponential(6),
          fmtSign(live.storedRate),
          '',
        ],
        [
          'pool-derived',
          fmtMana(live.poolLong),
          fmtMana(live.poolShort),
          live.poolDerived.toExponential(6),
          fmtSign(live.poolDerived),
          live.poolMatchesStored ? 'yes' : 'no',
        ],
        [
          'OI-derived',
          fmtMana(live.oiLong),
          fmtMana(live.oiShort),
          live.oiDerived.toExponential(6),
          fmtSign(live.oiDerived),
          live.oiMatchesStored ? 'yes' : 'no',
        ],
      ]
    )
  )
  if (!live.poolMatchesStored) {
    console.log('')
    console.log(
      'NOTE: the contract\'s stored fundingRate is a snapshot from the last ' +
        'funding event;\nthe book has traded since, so it is not expected to ' +
        'match the current pools.\nThe 63-event replay above is the ' +
        'authoritative check — it compares each\nrate against the pools as ' +
        'they were at that event.'
    )
  }
  return rep.passed
}

const printBook = () => {
  const snap = loadSnapshot()
  const state = snapshotToState(snap)
  const stats = bookStats(state, snap.oraclePrice)
  console.log(heading('LIVE BTC BOOK'))
  console.log(
    `contract ${snap.contractId} · slug ${snap.slug} · pulled ${snap.pulledAt}`
  )
  console.log(
    `oracle ${fmtNum(snap.oraclePrice)} · k=${snap.fundingSensitivity} · ` +
      `f_max=${snap.maxFundingRate} · period ${
        snap.fundingPeriodMs / 3_600_000
      }h · maxLeverage ${snap.maxLeverage}`
  )
  console.log('')
  console.log(
    table(
      [
        { header: '', align: 'left' },
        { header: 'positions' },
        { header: 'open interest' },
        { header: 'pool (margin)' },
        { header: 'unrealized PnL' },
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
  console.log('')
  console.log(
    `leverage: min ${fmtNum(stats.leverageMin, 2)}x · median ${fmtNum(
      stats.leverageMedian,
      2
    )}x · mean ${fmtNum(stats.leverageMean, 2)}x · max ${fmtNum(
      stats.leverageMax,
      2
    )}x · notional-weighted ${fmtNum(stats.leverageWeighted, 2)}x`
  )
  console.log(
    `pool ratio ${fmtRatio(imbalanceRatio(state, 'pool'))} · OI ratio ${fmtRatio(
      imbalanceRatio(state, 'openInterest')
    )}`
  )
  console.log(capacityNote())
}

const printRate = (args: Args) => {
  const o = optionsFrom(args)
  const snap = loadSnapshot()
  const state = snapshotToState(snap)
  const which = (args.flags.input ?? '').toLowerCase()
  const inputs: ImbalanceInput[] =
    which === 'pool'
      ? ['pool']
      : which === 'oi' || which === 'openinterest'
      ? ['openInterest']
      : ['pool', 'openInterest']
  console.log(heading('CURRENT RATE'))
  console.log(
    `k=${o.k} · f_max=${o.fMax} · p=${o.exponent} · period ${o.periodHours}h`
  )
  console.log('')
  console.log(
    table(
      [
        { header: 'input', align: 'left' },
        { header: 'ratio' },
        { header: 'rate' },
        { header: 'bps/period' },
        { header: 'dir', align: 'left' },
        { header: '%/day' },
        { header: '%/30d' },
      ],
      inputs.map((i) => {
        const rate = fundingRateFor(state, { ...o, imbalanceInput: i })
        const perDay = 24 / o.periodHours
        return [
          i,
          fmtRatio(imbalanceRatio(state, i)),
          rate.toExponential(6),
          fmtBps(rate),
          fmtSign(rate),
          fmtPct(compoundedDrag(rate, perDay)),
          fmtPct(compoundedDrag(rate, perDay * 30)),
        ]
      })
    )
  )
}

const printDrift = (args: Args) => {
  const o = optionsFrom(args)
  const snap = loadSnapshot()
  const state = snapshotToState(snap)
  const price = o.price ?? snap.oraclePrice
  const annualDriftPct = num(args.flags, 'annual-drift', 8)
  const params = { k: o.k, fMax: o.fMax, exponent: o.exponent, imbalanceInput: 'openInterest' as const }
  const cap = getPerpOpenInterestCapacity('long', state, price)
  const d = driftAnalysis({
    state,
    price,
    params,
    annualDriftPct,
    periodHours: o.periodHours,
    leverages: [1, 2, 5, 10, 25, 50, 100],
    maxLongOi: cap.limit,
  })

  console.log(heading(`DRIFT vs FUNDING — ${annualDriftPct}%/yr expected drift`))
  console.log(
    `Period ${o.periodHours}h · drift per period ${d.driftPerPeriod.toExponential(
      4
    )} · f_max ${d.fMax} (${fmtBps(d.fMax)} bps)`
  )
  console.log('')
  console.log(
    'A long earns drift on NOTIONAL and pays funding on MARGIN, so per unit of'
  )
  console.log('margin it collects drift x leverage and pays funding x 1.')
  console.log('')
  console.log(
    table(
      [
        { header: 'leverage' },
        { header: 'drift/period (of margin)' },
        { header: 'f_max (of margin)' },
        { header: 'rate needed' },
        { header: 'x f_max needed' },
        { header: 'imbalance ratio needed', align: 'left' },
        { header: 'covered?', align: 'left' },
      ],
      d.rows.map((r) => [
        `${r.leverage}x`,
        fmtBps(r.driftOnMargin),
        fmtBps(r.fundingAtCap),
        fmtBps(r.requiredRate),
        fmtNum(r.requiredFMaxMultiple, 2),
        r.requiredRatio === null
          ? 'unreachable'
          : `${fmtNum(r.requiredRatio, 2)}x`,
        r.coveredAtCap ? 'yes' : 'NO',
      ])
    )
  )
  console.log('')
  console.log(subheading('The part funding cannot fix'))
  console.log(
    'Funding is a TRANSFER between the two sides. It never adds mana to the'
  )
  console.log(
    'market, so it cannot offset drift in aggregate — it can only make being'
  )
  console.log('short attractive enough that net open interest goes to zero.')
  console.log('')
  console.log(
    `Net open interest today: ${fmtMana(d.netOi)} (long ${fmtMana(
      d.netOi > 0 ? d.netOi : 0
    )} net).`
  )
  console.log(
    `Drift on that net exposure leaks ${fmtMana(
      d.netLeakPerDay
    )}/day, ${fmtMana(d.netLeakPerYear)}/yr — ${fmtPct(
      d.leakAsShareOfEscrowPerYear
    )} of the ${fmtMana(d.escrow)} currently escrowed, per year.`
  )
  console.log('')
  console.log(
    `If longs filled their cap (${fmtMana(
      d.maxLongOi
    )} of open interest), that becomes ${fmtMana(d.maxNetLeakPerYear)}/yr.`
  )
}

const printPaths = (args: Args) => {
  const o = optionsFrom(args)
  const snap = loadSnapshot()
  const state = snapshotToState(snap)
  const price = o.price ?? snap.oraclePrice
  const input = (args.flags.input ?? 'oi').toLowerCase()
  const params = {
    k: o.k,
    fMax: o.fMax,
    exponent: o.exponent,
    imbalanceInput: (input === 'pool' ? 'pool' : 'openInterest') as
      | 'pool'
      | 'openInterest',
  }
  const perDay = Math.round(24 / o.periodHours)
  const grid = pathwayGrid({
    state,
    price,
    funding: params,
    moves: [-30, -20, -10, -5, 0, 5, 10, 20, 30],
    horizons: [
      { periods: perDay, days: 1, label: '1d' },
      { periods: perDay * 7, days: 7, label: '7d' },
      { periods: perDay * 30, days: 30, label: '30d' },
      { periods: perDay * 90, days: 90, label: '90d' },
    ],
    rampPeriods: perDay * 2,
    takerFeeBps: o.takerFeeBps,
    flow: o.flow,
    contractId: snap.contractId,
  })

  console.log(heading('PATHWAYS — where the market ends up'))
  console.log(
    `Funding from ${params.imbalanceInput === 'pool' ? 'POOLS' : 'OPEN INTEREST'
    } · k=${o.k} · f_max=${o.fMax} · price ${fmtNum(price)}`
  )
  console.log('')
  console.log(
    `Now: escrow ${fmtMana(grid.base.escrow)} · owed to traders ${fmtMana(
      grid.base.liability
    )} · buffer ${fmtMana(grid.base.buffer)}`
  )
  console.log(
    'Buffer = escrow minus what every open position would be paid if it closed'
  )
  console.log('at that price. It is the market\'s actual cushion.')
  console.log('')
  console.log(subheading('Buffer after the move (change from now)'))
  console.log(
    table(
      [
        { header: 'move', align: 'left' },
        { header: 'price' },
        ...grid.horizons.map((h) => ({ header: h.label })),
      ],
      grid.cells.map((row, i) => [
        `${grid.moves[i] > 0 ? '+' : ''}${grid.moves[i]}%`,
        fmtNum(row[0].endPrice, 0),
        ...row.map(
          (c) =>
            `${fmtMana(c.buffer)} (${c.bufferDelta >= 0 ? '+' : ''}${fmtMana(
              c.bufferDelta
            )})`
        ),
      ])
    )
  )
  console.log('')
  console.log(subheading('Liquidations / periods with ADL / aborted ticks'))
  console.log(
    table(
      [
        { header: 'move', align: 'left' },
        ...grid.horizons.map((h) => ({ header: h.label })),
      ],
      grid.cells.map((row, i) => [
        `${grid.moves[i] > 0 ? '+' : ''}${grid.moves[i]}%`,
        ...row.map((c) => `${c.liquidations} / ${c.adlPeriods} / ${c.blocked}`),
      ])
    )
  )
  console.log('')
  console.log(subheading('Funding moved, and by whom'))
  console.log(
    table(
      [
        { header: 'move', align: 'left' },
        ...grid.horizons.map((h) => ({ header: h.label })),
      ],
      grid.cells.map((row, i) => [
        `${grid.moves[i] > 0 ? '+' : ''}${grid.moves[i]}%`,
        ...row.map(
          (c) =>
            `${fmtMana(c.fundingMoved)}${
              c.fundingPayer === 'none' ? '' : ` ${c.fundingPayer}s pay`
            }`
        ),
      ])
    )
  )
}

const printShock = (args: Args) => {
  const o = optionsFrom(args)
  const snap = loadSnapshot()
  const state = snapshotToState(snap)
  const price = o.price ?? snap.oraclePrice
  const movePct = num(args.flags, 'move', 20)
  const days = num(args.flags, 'days', 1)
  const perDay = Math.round(24 / o.periodHours)
  const base = {
    k: o.k,
    fMax: o.fMax,
    exponent: o.exponent,
    imbalanceInput: 'openInterest' as const,
  }
  const r = shockResponse({
    state,
    price,
    movePct,
    periods: Math.round(perDay * days),
    rampPeriods: Math.round(perDay * days),
    base,
    ks: [0.5, 1, 3, 10],
    fMaxMultiples: [1, 10, 100],
    subsidies: [0, 50_000, 100_000, 250_000, 500_000],
    takerFeeBps: o.takerFeeBps,
    flow: o.flow,
    contractId: snap.contractId,
  })

  console.log(
    heading(`SHOCK — ${movePct > 0 ? '+' : ''}${movePct}% over ${days} day(s)`)
  )
  console.log(`Buffer before the move: ${fmtMana(r.baseline)}`)
  console.log('')
  console.log(subheading('Can funding parameters protect the buffer?'))
  console.log(
    table(
      [
        { header: 'setting', align: 'left' },
        { header: 'buffer after' },
        { header: 'change' },
        { header: 'funding moved' },
        { header: 'liq' },
        { header: 'ADL' },
      ],
      r.funding.map((x) => [
        x.label,
        fmtMana(x.buffer),
        fmtMana(x.bufferDelta),
        fmtMana(x.fundingMoved),
        `${x.liquidations}`,
        `${x.adlPeriods}`,
      ])
    )
  )
  const spread =
    Math.max(...r.funding.map((x) => x.buffer)) -
    Math.min(...r.funding.map((x) => x.buffer))
  console.log('')
  console.log(
    `Total spread across every funding setting above: ${fmtMana(
      spread
    )} of buffer.`
  )
  console.log('')
  console.log(subheading('What subsidy does to the same shock'))
  console.log(
    table(
      [
        { header: 'subsidy', align: 'left' },
        { header: 'buffer after' },
        { header: 'change vs now' },
        { header: 'liq' },
        { header: 'ADL' },
      ],
      r.subsidy.map((x) => [
        x.label,
        fmtMana(x.buffer),
        fmtMana(x.bufferDelta),
        `${x.liquidations}`,
        `${x.adlPeriods}`,
      ])
    )
  )
}

const printReplay = (args: Args) => {
  const o = optionsFrom(args)
  const snap = loadSnapshot()
  const state = snapshotToState(snap)
  const price = o.price ?? snap.oraclePrice
  const daily = loadDaily()
  const days = num(args.flags, 'days', 90)
  const input = (args.flags.input ?? 'oi').toLowerCase()
  const funding = {
    k: o.k,
    fMax: o.fMax,
    exponent: o.exponent,
    imbalanceInput: (input === 'pool' ? 'pool' : 'openInterest') as
      | 'pool'
      | 'openInterest',
  }

  console.log(heading(`REPLAY — real BTC ${days}-day windows`))
  console.log(
    `Feed ${daily.feedId} · ${daily.first} to ${daily.last} · ${daily.n} daily closes`
  )
  console.log(
    `Realized vol: ${fmtPct(daily.realizedVol.sdHourly, 3)}/hour, ${fmtPct(
      daily.realizedVol.sdDaily,
      2
    )}/day, ${fmtPct(daily.realizedVol.sdAnnual, 1)}/yr ` +
      `(from ${daily.realizedVol.nHourlyReturns} hourly returns)`
  )
  console.log('')
  console.log(subheading('1SD and 2SD moves, by horizon'))
  const bands = sigmaBands(daily.realizedVol.sdHourly, [
    { label: '1 hour', hours: 1 },
    { label: '1 day', hours: 24 },
    { label: '1 week', hours: 24 * 7 },
    { label: '30 days', hours: 24 * 30 },
    { label: '90 days', hours: 24 * 90 },
  ])
  console.log(
    table(
      [
        { header: 'horizon', align: 'left' },
        { header: '-2SD' },
        { header: '-1SD' },
        { header: '+1SD' },
        { header: '+2SD' },
      ],
      bands.map((b) => [
        b.label,
        fmtPct(b.down2, 1),
        fmtPct(b.down1, 1),
        fmtPct(b.up1, 1),
        fmtPct(b.up2, 1),
      ])
    )
  )

  // Windows: the most recent, plus evenly spaced starts across the year.
  const maxStart = daily.px.length - days - 1
  const starts = [
    maxStart,
    ...[0, 0.2, 0.4, 0.6, 0.8].map((f) => Math.floor(maxStart * f)),
  ]
  const invert = args.flags.invert === 'true' || args.flags.invert === ''
  const results = starts.map((s, i) =>
    replayWindow({
      state,
      startPrice: price,
      daily,
      startIndex: s,
      days,
      label: i === 0 ? 'most recent' : `start +${s}d`,
      funding,
      takerFeeBps: o.takerFeeBps,
      flow: o.flow,
      contractId: snap.contractId,
      invert,
    })
  )
  if (invert)
    console.log(
      '\nRETURNS INVERTED — every window mirrored, so falls become equivalent rises.'
    )

  console.log('')
  console.log(
    subheading(`Mirroring each window onto today's book (${days} days)`)
  )
  console.log(
    table(
      [
        { header: 'window', align: 'left' },
        { header: 'from', align: 'left' },
        { header: 'return' },
        { header: 'max drawdown' },
        { header: 'daily sd' },
        { header: 'end buffer' },
        { header: 'min buffer' },
        { header: 'vs now' },
        { header: 'liq' },
        { header: 'ADL' },
        { header: 'blk' },
      ],
      results.map((r) => [
        r.label,
        r.startDate,
        fmtPct(r.totalReturnPct / 100, 1),
        fmtPct(r.maxDrawdownPct / 100, 1),
        fmtPct(r.realisedSdDaily, 2),
        fmtMana(r.endBuffer),
        fmtMana(r.minBuffer),
        fmtMana(r.bufferDelta),
        `${r.liquidations}`,
        `${r.adlPeriods}`,
        `${r.blocked}`,
      ])
    )
  )
  console.log('')
  console.log(
    'Daily closes cannot contain an intraday wick, so liquidation counts here'
  )
  console.log('are a FLOOR, not an estimate.')
}

const printEquilibrium = (args: Args) => {
  const o = optionsFrom(args)
  const snap = loadSnapshot()
  const annualDriftPct = num(args.flags, 'annual-drift', 8)
  const longLeverage = num(args.flags, 'long-lev', 10)
  const shortLeverage = num(args.flags, 'short-lev', 5)
  const params = {
    k: o.k,
    fMax: o.fMax,
    exponent: o.exponent,
    imbalanceInput: 'openInterest' as const,
  }
  const eq = equilibriumAnalysis({
    params,
    annualDriftPct,
    periodHours: o.periodHours,
    longLeverage,
    shortLeverage,
    ratios: [1.2, 1.5, 2, 3, 4, 5, 9, 19],
    targetShortShares: [10, 20, 30, 40, 50],
  })
  const perYear = (r: number) => r * ((365 * 24) / o.periodHours) * 100

  console.log(
    heading(
      `CROWDING EQUILIBRIUM — ${annualDriftPct}%/yr drift, longs at ${longLeverage}x`
    )
  )
  console.log(
    `k=${o.k} · f_max=${o.fMax} · shorts modelled at ${shortLeverage}x ` +
      `(their leverage cancels from the break-even — see below)`
  )
  console.log('')
  console.log(
    table(
      [
        { header: 'OI split (L/S)', align: 'left' },
        { header: 'ratio' },
        { header: 'funding bps' },
        { header: "short's yield %/yr" },
        { header: "short's drift cost %/yr" },
        { header: 'short EV %/yr' },
        { header: 'long EV %/yr' },
        { header: 'shorts want in?', align: 'left' },
      ],
      eq.rows.map((r) => [
        `${(100 - r.shortSharePct).toFixed(0)}/${r.shortSharePct.toFixed(0)}`,
        fmtNum(r.ratio, 2),
        fmtBps(r.fundingRate),
        fmtNum(perYear(r.shortYield), 0),
        fmtNum(perYear(r.shortDriftCost), 0),
        fmtNum(perYear(r.shortEv), 0),
        fmtNum(perYear(r.longEv), 0),
        r.shortAttractive ? 'yes' : 'NO',
      ])
    )
  )

  console.log('')
  console.log(subheading('Where it settles'))
  if (eq.equilibriumRatio === null) {
    console.log(
      'Shorts are never paid enough at this drift and leverage — the book has'
    )
    console.log('no settling point short of the capacity cap.')
  } else {
    console.log(
      `Shorts stop entering at an OI ratio of ${fmtNum(
        eq.equilibriumRatio,
        2
      )} — a ${(100 - (eq.equilibriumShortSharePct ?? 0)).toFixed(0)}/${(
        eq.equilibriumShortSharePct ?? 0
      ).toFixed(0)} long/short split.`
    )
    console.log(
      `At that point the LONG side is still earning ${fmtNum(
        perYear(eq.longEvAtEquilibrium ?? 0),
        0
      )}%/yr.`
    )
    console.log('')
    console.log(
      'That is the important asymmetry: funding pins the RATIO, but both sides'
    )
    console.log(
      'can be +EV at the settling point, so total open interest keeps growing'
    )
    console.log(
      'until the capacity cap binds. The escrow funds the difference, and that'
    )
    console.log('difference is drift x NET open interest.')
  }

  console.log('')
  console.log(subheading('f_max needed to hold a given short share'))
  console.log(
    table(
      [
        { header: 'short share', align: 'left' },
        { header: 'OI ratio' },
        { header: 'f_max needed' },
        { header: 'x current' },
        { header: 'annualised' },
      ],
      eq.required.map((r) => [
        `${r.shortSharePct}%`,
        fmtNum(r.ratio, 2),
        r.fMaxNeeded.toExponential(3),
        fmtNum(r.multipleOfCurrent, 2),
        `${fmtNum(perYear(r.fMaxNeeded), 0)}%`,
      ])
    )
  )
}

const printDesign = (args: Args) => {
  const o = optionsFrom(args)
  const sigmas = num(args.flags, 'sigmas', 2)
  const params = {
    k: o.k,
    fMax: o.fMax,
    exponent: o.exponent,
    imbalanceInput: 'openInterest' as const,
  }
  const results = DEFAULT_ASSETS.map((asset) =>
    designMarket({ asset, params, periodHours: o.periodHours, sigmas })
  )

  console.log(heading('MARKET DESIGN — leverage caps by constraint'))
  console.log(
    `f_max ${o.fMax} (${fmtNum(
      o.fMax * ((365 * 24) / o.periodHours) * 100,
      0
    )}%/yr) · k=${o.k} · liquidation must survive a ${sigmas}-sigma day`
  )
  console.log('')
  console.log(
    table(
      [
        { header: 'asset', align: 'left' },
        { header: 'drift %/yr' },
        { header: 'vol %/yr' },
        { header: '1SD day' },
        { header: '1SD 90d' },
        { header: 'max lev (drift)' },
        { header: 'max lev (vol)' },
        { header: 'RECOMMEND' },
        { header: 'binds on', align: 'left' },
      ],
      results.map((r) => [
        r.asset.name,
        fmtNum(r.asset.driftPct, 1),
        fmtNum(r.asset.volPct, 1),
        `${fmtNum(r.move1SdDailyPct, 2)}%`,
        `${fmtNum(r.move1Sd90dPct, 1)}%`,
        Number.isFinite(r.driftMaxLeverage)
          ? `${fmtNum(r.driftMaxLeverage, 1)}x`
          : 'unbounded',
        `${fmtNum(r.volMaxLeverage, 1)}x`,
        `${fmtNum(r.recommendedLeverage, 0)}x`,
        r.bindingConstraint,
      ])
    )
  )

  console.log('')
  console.log(subheading('At the recommended cap, where does the book settle?'))
  console.log(
    table(
      [
        { header: 'asset', align: 'left' },
        { header: 'cap' },
        { header: 'settles at (L/S)', align: 'left' },
        { header: "long's residual edge %/yr" },
        { header: 'f_max for a neutral long' },
        { header: 'x current' },
        { header: 'lev for <=10%/yr long edge' },
      ],
      results.map((r) => [
        r.asset.name,
        `${fmtNum(r.recommendedLeverage, 0)}x`,
        r.equilibriumShortSharePct === null
          ? 'no settling point'
          : `${fmtNum(100 - r.equilibriumShortSharePct, 0)}/${fmtNum(
              r.equilibriumShortSharePct,
              0
            )}`,
        r.longResidualEvPct === null
          ? '—'
          : fmtNum(r.longResidualEvPct, 0),
        r.fMaxForNeutral.toExponential(3),
        fmtNum(r.fMaxForNeutralMultiple, 2),
        `${fmtNum(r.leverageForTargetEdge, 1)}x`,
      ])
    )
  )
  console.log('')
  console.log('Assumptions behind each row:')
  for (const r of results)
    console.log(`  ${r.asset.name.padEnd(6)} ${r.asset.source}`)
}

const printHouse = (args: Args) => {
  const book = loadBuckets()
  const v = houseView(book)
  const feeBps = num(args.flags, 'taker-fee-bps', 10)

  console.log(heading('HOUSE ECONOMICS — BTC'))
  console.log(`Book pulled ${book.pulledAt} · oracle ${fmtNum(book.oraclePrice)}`)
  console.log('')
  console.log(
    table(
      [
        { header: 'component', align: 'left' },
        { header: 'mana' },
        { header: 'share of escrow' },
      ],
      [
        ['escrow (pools L + S)', fmtMana(v.escrow), '100.0%'],
        ['  trader margin', fmtMana(v.traderMargin), fmtPct(v.traderMargin / v.escrow, 1)],
        ['  HOUSE MONEY', fmtMana(v.houseMoney), fmtPct(v.houseMoney / v.escrow, 1)],
      ]
    )
  )
  console.log('')
  console.log(
    `Open interest ${fmtMana(v.openInterest)} on ${fmtMana(
      v.traderMargin
    )} of trader margin — aggregate leverage ${fmtNum(v.aggregateLeverage, 1)}x.`
  )
  console.log(
    `Cover that OI requires at the ${'10'}x multiple: ${fmtMana(
      v.coverRequired
    )}. House money available: ${fmtMana(v.houseMoney)}.`
  )
  console.log('')
  console.log(subheading('Where the exposure actually sits'))
  console.log(
    `Positions at 50-100x carry ${fmtMana(v.topBucket.oi)} of notional — ` +
      `${fmtNum(v.topBucket.sharePct, 1)}% of all open interest — on ` +
      `${fmtMana(v.topBucket.margin)} of margin (${fmtNum(
        v.topBucket.impliedLeverage,
        0
      )}x aggregate).`
  )
  console.log(
    `Net open interest ${fmtMana(v.netOi)} long. That is what the house's ` +
      `money is exposed to:`
  )
  console.log('')
  console.log(
    table(
      [
        { header: 'move against the net', align: 'left' },
        { header: 'cost to escrow' },
        { header: 'of house money' },
      ],
      v.moveCost.map((m) => [
        `${m.movePct}%`,
        fmtMana(m.cost),
        fmtPct(m.pctOfHouseMoney / 100, 1),
      ])
    )
  )
  console.log('(upper bound — liquidations cap the real figure; the sim is exact)')

  console.log('')
  console.log(subheading('What a leverage cap does, holding margin fixed'))
  console.log(
    table(
      [
        { header: 'max leverage', align: 'left' },
        { header: 'open interest' },
        { header: 'OI removed' },
        { header: 'cover required' },
        { header: 'house money freed' },
        { header: 'net OI' },
      ],
      [100, 50, 25, 20, 10, 5].map((cap) => {
        const c = applyLeverageCap(book, cap)
        return [
          `${cap}x`,
          fmtMana(c.openInterest),
          `${fmtNum(c.oiRemovedPct, 0)}%`,
          fmtMana(c.coverRequired),
          fmtMana(c.houseMoneyFreed),
          fmtMana(c.netOi),
        ]
      })
    )
  )

  console.log('')
  console.log(subheading('The house edge that already exists'))
  for (const bps of [feeBps, 20, 30]) {
    const f = feeEconomics(book, bps)
    console.log(
      `  ${String(bps).padStart(2)} bps: ${fmtMana(
        f.revenuePerDay
      )}/day, ${fmtMana(f.revenuePerYear)}/yr — ${fmtNum(
        f.yieldOnHouseMoneyPct,
        0
      )}%/yr on the house's ${fmtMana(f.houseMoney)}, payback ${fmtNum(
        f.paybackYears,
        2
      )} years`
    )
  }
  const f = feeEconomics(book, feeBps)
  console.log('')
  console.log(
    `Organic notional averages ${fmtMana(
      f.organicNotionalPerDay
    )}/day over ${book.organicVolume.days.length} days (Aug 5-6 excluded: two`
  )
  console.log('accounts generated 96% of all volume during launch QA).')
}

const printBurn = (args: Args) => {
  const base = {
    ...DEFAULT_HOUSE_PARAMS,
    subsidy: num(args.flags, 'subsidy', DEFAULT_HOUSE_PARAMS.subsidy),
    feeBps: num(args.flags, 'taker-fee-bps', DEFAULT_HOUSE_PARAMS.feeBps),
    traderEdgeBps: num(args.flags, 'trader-edge-bps', 0),
    netOiFraction: num(args.flags, 'net-oi-frac', DEFAULT_HOUSE_PARAMS.netOiFraction),
    dailyTurnover: num(args.flags, 'turnover', DEFAULT_HOUSE_PARAMS.dailyTurnover),
    paths: num(args.flags, 'paths', 2000),
  }

  console.log(heading('HOUSE P&L OVER 12 MONTHS'))
  console.log(
    `${base.paths} paths, block-bootstrapped from real btc-usd daily returns.`
  )
  console.log(
    `Subsidy ${fmtMana(base.subsidy)} · OI ${fmtNum(
      base.oiToHouseMoney,
      1
    )}x house money · net OI ${fmtPct(base.netOiFraction, 1)} of OI · turnover ${fmtNum(
      base.dailyTurnover,
      2
    )}/day · fee ${base.feeBps} bps · trader edge ${base.traderEdgeBps} bps`
  )

  const r = runHouseSim(base)
  console.log('')
  console.log(
    table(
      [
        { header: 'component', align: 'left' },
        { header: 'mean over 12 months' },
      ],
      [
        ['taker fees', fmtMana(r.meanFees)],
        ['directional (net OI x return)', fmtMana(r.meanDirectional)],
        ['liquidation gaps', fmtMana(r.meanGaps)],
        ['NET', fmtMana(r.mean)],
      ]
    )
  )
  console.log('')
  console.log(
    table(
      [
        { header: 'outcome', align: 'left' },
        { header: 'P&L' },
        { header: 'as % of stake' },
      ],
      [
        ['worst path', fmtMana(r.worstPath), fmtPct(r.worstPath / base.subsidy, 0)],
        ['5th percentile', fmtMana(r.p5), fmtPct(r.p5 / base.subsidy, 0)],
        ['25th', fmtMana(r.p25), fmtPct(r.p25 / base.subsidy, 0)],
        ['median', fmtMana(r.median), fmtPct(r.median / base.subsidy, 0)],
        ['75th', fmtMana(r.p75), fmtPct(r.p75 / base.subsidy, 0)],
        ['95th', fmtMana(r.p95), fmtPct(r.p95 / base.subsidy, 0)],
        ['best path', fmtMana(r.bestPath), fmtPct(r.bestPath / base.subsidy, 0)],
      ]
    )
  )
  console.log('')
  console.log(
    `P(ahead after 12 months) = ${fmtPct(r.probAhead, 1)} · P(house money fully burned) = ${fmtPct(
      r.probRuin,
      1
    )}`
  )
  console.log(
    `mean ${fmtMana(r.mean)} vs sd ${fmtMana(r.sdPnl)} — signal-to-noise ${fmtNum(
      r.ratio,
      2
    )} · mean max drawdown ${fmtMana(r.meanMaxDrawdown)}`
  )

  console.log('')
  console.log(subheading('Does adding liquidity improve the odds?'))
  console.log(
    table(
      [
        { header: 'subsidy', align: 'left' },
        { header: 'mean P&L' },
        { header: 'sd' },
        { header: 'P(ahead)' },
        { header: 'signal/noise' },
      ],
      [122810, 250000, 500000, 1000000, 2000000].map((s) => {
        const x = runHouseSim({ ...base, subsidy: s, paths: 800 })
        return [
          fmtMana(s),
          fmtMana(x.mean),
          fmtMana(x.sdPnl),
          fmtPct(x.probAhead, 1),
          fmtNum(x.ratio, 2),
        ]
      })
    )
  )
  console.log('')
  console.log(
    'Everything scales together, so the odds do not move. Size sets how much'
  )
  console.log('you win or lose, not how likely you are to win.')

  console.log('')
  console.log(subheading('What DOES move the odds'))
  const variants: [string, Partial<typeof base>][] = [
    ['baseline', {}],
    ['fee 20 bps', { feeBps: 20 }],
    ['fee 30 bps', { feeBps: 30 }],
    ['turnover halves', { dailyTurnover: base.dailyTurnover / 2 }],
    ['net OI 17% (funding fix)', { netOiFraction: 0.17 }],
    ['net OI 10%', { netOiFraction: 0.1 }],
    ['traders +2 bps edge', { traderEdgeBps: 2 }],
    ['traders +5 bps edge', { traderEdgeBps: 5 }],
    ['traders +10 bps edge', { traderEdgeBps: 10 }],
  ]
  console.log(
    table(
      [
        { header: 'scenario', align: 'left' },
        { header: 'mean P&L' },
        { header: 'P(ahead)' },
        { header: 'P(ruin)' },
        { header: 'signal/noise' },
      ],
      variants.map(([label, over]) => {
        const x = runHouseSim({ ...base, ...over, paths: 800 })
        return [
          label,
          fmtMana(x.mean),
          fmtPct(x.probAhead, 1),
          fmtPct(x.probRuin, 1),
          fmtNum(x.ratio, 2),
        ]
      })
    )
  )

  const sn = signalToNoise({
    dailyTurnover: base.dailyTurnover,
    feeBps: base.feeBps,
    netOiFraction: base.netOiFraction,
    annualVol: 0.43,
  })
  console.log('')
  console.log(
    `Closed form: annual fee yield ${fmtPct(
      sn.annualFeeYield,
      1
    )} of OI vs directional risk ${fmtPct(sn.annualRisk, 1)} of OI — ratio ${fmtNum(
      sn.ratio,
      2
    )}.`
  )
}

const main = () => {
  const args = parseArgs(process.argv.slice(2))
  const cmd = (args._[0] ?? 'help').toLowerCase()
  if (cmd === 'help' || args.flags.help) {
    console.log(USAGE)
    return
  }

  if (cmd === 'validate') {
    process.exitCode = printValidation() ? 0 : 1
    return
  }
  if (cmd === 'book') return printBook()
  if (cmd === 'rate') return printRate(args)
  if (cmd === 'diagnose') return printDiagnosis()
  if (cmd === 'drift') return printDrift(args)
  if (cmd === 'paths') return printPaths(args)
  if (cmd === 'shock') return printShock(args)
  if (cmd === 'replay') return printReplay(args)
  if (cmd === 'equilibrium' || cmd === 'eq') return printEquilibrium(args)
  if (cmd === 'design') return printDesign(args)
  if (cmd === 'house') return printHouse(args)
  if (cmd === 'burn') return printBurn(args)

  const o = optionsFrom(args)
  const run = (which: string) => {
    if (which === '1') {
      console.log(scenario1(o))
      console.log(capacityNote())
    } else if (which === '2') console.log(scenario2(o))
    else if (which === '3') console.log(scenario3(o))
    else if (which === '4') console.log(scenario4(o))
  }

  if (cmd === 'all') {
    const ok = printValidation()
    if (!ok) {
      console.error('\nValidation failed — refusing to print scenarios.')
      process.exitCode = 1
      return
    }
    for (const s of ['1', '2', '3', '4']) run(s)
    return
  }

  if (['1', '2', '3', '4'].includes(cmd)) return run(cmd)

  console.error(`unknown command "${cmd}"`)
  console.log(USAGE)
  process.exitCode = 1
}

main()
