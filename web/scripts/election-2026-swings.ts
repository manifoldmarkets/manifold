// Writes web/public/data/election-2026-swings.json: "2026's biggest swings"
// for /election, the midterm races whose odds moved most from a week out to
// the result. Public data only: the /election2026 replay snapshot
// (web/scripts/election-2026-replay-snapshot.ts) for the odds, and the map's
// markets through the anon Supabase client for labels and resolutions. Each
// race is read exactly as the map read it at each frame (liveAsOf +
// buildRaces), so the numbers match the replay. Rerun it as races resolve:
//
//   cd web
//   TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node"}' \
//     node --no-experimental-strip-types -r ts-node/register/transpile-only \
//     -r tsconfig-paths/register scripts/election-2026-swings.ts
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { keyBy, uniq } from 'lodash'
import { Answer } from 'common/answer'
import { BinaryContract, Contract, isMultiCpmm } from 'common/contract'
import { ENV_CONFIG } from 'common/envs/constants'
import { marketProbsAtFrame } from 'common/market-probs-history'
import { getContracts } from 'common/supabase/contracts'
import { createClient } from 'common/supabase/utils'
import { ReplaySnapshot } from 'web/components/election-2026/replay-model'
import {
  complementParty,
  sourceAudit,
} from 'web/components/usa-map/audited-sources'
import {
  approvalChance,
  BALLOT_MEASURES,
  BallotMeasure,
  MEASURE_CONTRACT_IDS,
} from 'web/components/usa-map/ballot-measures-model'
import {
  buildRaces,
  ElectionMode,
  Race,
} from 'web/components/usa-map/election-map-model'
import {
  liveAsOf,
  POLLS_CLOSE_2026,
} from 'web/components/usa-map/election-rewind-model'
import type { LiveElectionContracts } from 'web/components/usa-map/live-election-map'
import { binaryRows } from 'web/components/usa-map/race-outcomes'
import {
  isDemocraticAnswer,
  isRepublicanAnswer,
} from 'web/components/usa-map/state-election-map'
import { DATA } from 'web/components/usa-map/usa-map-data'
import {
  rankSwings,
  Swing2026,
  Swings2026File,
  SwingTimeline,
  twoPartyDem,
} from 'web/lib/politics/swings-2026'
import {
  MapContractsDictionary,
  MIDTERMS_2026,
} from 'web/public/data/elections-data'
import { governors2026 } from 'web/public/data/governors-data'
import {
  HOUSE_DISTRICT_MARKETS,
  HOUSE_RACE_MARKETS,
} from 'web/public/data/house-market-data'
import { senate2026 } from 'web/public/data/senate-state-data'

const SNAPSHOT = join(__dirname, '../public/data/election-2026-replay.json')
const OUT = join(__dirname, '../public/data/election-2026-swings.json')
const MODES: ElectionMode[] = ['senate', 'governor', 'house']
const MINUTE_MS = 60_000

type Party = 'D' | 'R' | 'other'
type Winner = { party: Party; time?: number }

// A multi-choice answer's party: the audited classification when the source
// has one, else the map's label reading (as the TV board reads winners).
function answerParty(contract: Contract, answer: Answer) {
  const audited = sourceAudit(contract.slug)
  const party =
    audited?.contractId === contract.id
      ? audited.answerParties?.[answer.id]
      : undefined
  if (party === 'D' || party === 'R') return party
  if (isDemocraticAnswer(answer.text)) return 'D'
  if (isRepublicanAnswer(answer.text)) return 'R'
  return undefined
}

const asParty = (party: string | undefined): Party =>
  party === 'D' || party === 'R' ? party : 'other'

// Who won a race, from its live market, the way the TV board calls races: a
// House portfolio answer prices the Democrat; a binary's YES/NO rows carry
// the audited party (a NO that only says "any other winner" counts as the
// other major party wherever it has a nominee, as the map's complement fold
// does); a multi-choice market names its winner in contract.resolution.
// Undefined while unresolved, cancelled or resolved to a percentage.
function raceWinner(race: Race, mode: ElectionMode): Winner | undefined {
  const { contract, answerId } = race
  if (!contract) return undefined
  if (answerId && isMultiCpmm(contract)) {
    const answer = contract.answers.find((a) => a.id === answerId)
    const time = answer?.resolutionTime
    if (answer?.resolution === 'YES') return { party: 'D', time }
    if (answer?.resolution === 'NO')
      return {
        party: complementParty('house', race.id, 'D') === 'R' ? 'R' : 'other',
        time,
      }
    return undefined
  }
  const { resolution } = contract
  if (!contract.isResolved || !resolution) return undefined
  if (resolution === 'CANCEL' || resolution === 'MKT') return undefined
  const time = contract.resolutionTime
  if (contract.mechanism === 'cpmm-1' && contract.outcomeType === 'BINARY') {
    const rows = binaryRows(contract as BinaryContract, race, mode)
    if (resolution === 'YES') return { party: asParty(rows.YES.party), time }
    if (resolution !== 'NO') return undefined
    if (rows.NO.party !== 'any') return { party: asParty(rows.NO.party), time }
    const yes = rows.YES.party
    const other =
      yes === 'D' || yes === 'R'
        ? complementParty(mode, race.id, yes)
        : undefined
    return { party: asParty(other), time }
  }
  if (isMultiCpmm(contract)) {
    const winner =
      contract.answers.find((a) => a.id === resolution) ??
      contract.answers.find((a) => a.resolution === 'YES')
    if (!winner) return undefined
    return { party: asParty(answerParty(contract, winner)), time }
  }
  return undefined
}

// A ballot measure's result from its audited source: whether it passed.
function measurePassed(
  measure: BallotMeasure,
  contract: Contract | null | undefined
): { value: 0 | 1; time?: number } | undefined {
  const s = measure.source
  if (!s || !contract || contract.id !== s.contractId) return undefined
  if (s.kind === 'binary') {
    const { resolution } = contract
    if (!contract.isResolved || (resolution !== 'YES' && resolution !== 'NO'))
      return undefined
    const yes = resolution === 'YES'
    const passed = s.yesOrientation === 'approve' ? yes : !yes
    return { value: passed ? 1 : 0, time: contract.resolutionTime }
  }
  if (!isMultiCpmm(contract)) return undefined
  const answer = contract.answers.find((a) => a.id === s.answerId)
  if (answer?.resolution !== 'YES' && answer?.resolution !== 'NO')
    return undefined
  return {
    value: answer.resolution === 'YES' ? 1 : 0,
    time: answer.resolutionTime,
  }
}

// A race priced by a market (not a same-party ballot, a decided seat or a
// candidate-only bet), as the TV board counts them.
const isPriced = (race: Race) =>
  !!race.contract &&
  !!race.odds &&
  (race.basis === undefined || race.basis.kind === 'market')

const raceKey = (mode: ElectionMode, race: Race) => `${mode}:${race.id}`

const racesOf = (live: LiveElectionContracts) =>
  MODES.flatMap((mode) =>
    buildRaces(
      mode,
      mode === 'senate'
        ? live.senate
        : mode === 'governor'
        ? live.governor
        : {},
      live.house,
      live.additionalHouse
    ).map((race) => ({ mode, race }))
  )

// One line per scalar field, the sparkline on one line: diffable and small.
function formatFile(file: Swings2026File) {
  const swing = (s: Swing2026) => {
    const { points, ...rest } = s
    const fields = Object.entries(rest).map(
      ([k, v]) => `      ${JSON.stringify(k)}: ${JSON.stringify(v)}`
    )
    fields.push(`      "points": ${JSON.stringify(points)}`)
    return `    {\n${fields.join(',\n')}\n    }`
  }
  return `{
  "generatedAt": ${file.generatedAt},
  "windowStart": ${file.windowStart},
  "windowEnd": ${file.windowEnd},
  "swings": [
${file.swings.map(swing).join(',\n')}
  ]
}
`
}

const pct = (p: number) => `${Math.round(p * 100)}%`

async function main() {
  const snapshot = JSON.parse(readFileSync(SNAPSHOT, 'utf8')) as ReplaySnapshot
  const { times } = snapshot
  const lastFrame = times.length - 1
  const pollsFrame =
    snapshot.milestones.find((m) => m.id === 'polls')?.frame ??
    times.findIndex((t) => t >= POLLS_CLOSE_2026)
  if (lastFrame < 1 || pollsFrame < 0) throw new Error('Bad snapshot')

  // The map's markets, as getElectionMapProps loads them.
  const db = createClient(
    ENV_CONFIG.supabaseInstanceId,
    ENV_CONFIG.supabaseAnonKey
  )
  const slugs = uniq([
    ...senate2026.map((m) => m.slug),
    ...governors2026.map((m) => m.slug),
    ...HOUSE_DISTRICT_MARKETS,
    ...HOUSE_RACE_MARKETS.map((m) => m.slug),
    MIDTERMS_2026.houseControl,
    MIDTERMS_2026.senateControl,
    MIDTERMS_2026.houseDistricts,
    // Not a race; loaded so the log can name it among the unused markets.
    MIDTERMS_2026.balanceOfPower,
  ])
  const bySlug = keyBy(await getContracts(db, slugs, 'slug'), (c) => c.slug)
  const measures = await getContracts(db, MEASURE_CONTRACT_IDS, 'id', true)
  const missing = slugs.filter((s) => !bySlug[s])
  if (missing.length) console.warn(`Missing markets: ${missing.join(', ')}`)

  const stateDictionary = (list: { state: string; slug: string }[]) =>
    Object.fromEntries(
      list.flatMap((m) => (bySlug[m.slug] ? [[m.state, bySlug[m.slug]]] : []))
    ) as MapContractsDictionary
  const live: LiveElectionContracts = {
    senate: stateDictionary(senate2026),
    governor: stateDictionary(governors2026),
    house: bySlug[MIDTERMS_2026.houseDistricts] ?? null,
    additionalHouse: Object.fromEntries(
      [...HOUSE_DISTRICT_MARKETS, ...HOUSE_RACE_MARKETS.map((m) => m.slug)].map(
        (slug) => [slug, bySlug[slug] ?? null]
      )
    ),
    measures: Object.fromEntries(measures.map((c) => [c.id, c])),
    houseControl: bySlug[MIDTERMS_2026.houseControl] ?? null,
    senateControl: bySlug[MIDTERMS_2026.senateControl] ?? null,
  }

  // Each race's two-party Democratic share and each measure's approval
  // chance at every frame, read off the map as it stood then.
  const raceValues = new Map<string, (number | undefined)[]>()
  const firstOdds = new Map<string, Race['odds']>()
  // Every measure with a market. (A source's `offBallot` is how its market
  // resolves if the measure leaves the ballot, not that it left.)
  const measureList = BALLOT_MEASURES.filter((m) => m.source)
  const measureValues = new Map<string, (number | undefined)[]>()
  for (let frame = 0; frame <= lastFrame; frame++) {
    const asOf = liveAsOf(live, snapshot, frame)
    for (const { mode, race } of racesOf(asOf)) {
      if (!isPriced(race)) continue
      const key = raceKey(mode, race)
      if (frame === 0) firstOdds.set(key, race.odds)
      const values = raceValues.get(key) ?? []
      values[frame] = twoPartyDem(race.odds)
      raceValues.set(key, values)
    }
    for (const m of measureList) {
      const values = measureValues.get(m.key) ?? []
      values[frame] = approvalChance(m, asOf.measures[m.source!.contractId])
      measureValues.set(m.key, values)
    }
  }
  const fill = (values: (number | undefined)[] | undefined) =>
    Array.from({ length: lastFrame + 1 }, (_, f) => values?.[f])

  const timelines: SwingTimeline[] = []
  const usedIds = new Set<string>()
  const skipped = { notTwoParty: [] as string[], otherWinner: [] as string[] }
  let resolvedRaces = 0
  let openRaces = 0

  for (const { mode, race } of racesOf(live)) {
    if (!isPriced(race) || !race.contract) continue
    const key = raceKey(mode, race)
    const label = mode === 'house' ? race.shortLabel : race.label
    usedIds.add(race.contract.id)
    // Both major parties have to be in the race a week out: a one-sided
    // market or an independent's race has no two-party share to follow.
    const odds = firstOdds.get(key)
    if (!odds || !(odds.dem > 0) || !(odds.rep > 0)) {
      skipped.notTwoParty.push(label)
      continue
    }
    const winner = raceWinner(race, mode)
    if (winner?.party === 'other') {
      skipped.otherWinner.push(label)
      continue
    }
    if (winner) resolvedRaces++
    else openRaces++
    timelines.push({
      contractId: race.contract.id,
      slug: race.contract.slug,
      creatorUsername: race.contract.creatorUsername,
      label,
      office: mode,
      state: race.state,
      values: fill(raceValues.get(key)),
      ...(winner && {
        result: { value: winner.party === 'D' ? 1 : 0, time: winner.time },
      }),
    })
  }

  let resolvedMeasures = 0
  let openMeasures = 0
  for (const m of measureList) {
    const contract = live.measures[m.source!.contractId]
    if (!contract) continue
    usedIds.add(contract.id)
    const result = measurePassed(m, contract)
    if (result) resolvedMeasures++
    else openMeasures++
    timelines.push({
      contractId: contract.id,
      slug: contract.slug,
      creatorUsername: contract.creatorUsername,
      label: `${DATA[m.state]?.name ?? m.state} ${m.designation ?? m.title}`,
      office: 'measure',
      state: m.state,
      values: fill(measureValues.get(m.key)),
      ...(result && { result }),
    })
  }

  // Chamber control: binary, YES = a Republican majority. Read straight from
  // the snapshot's prices; a resolved binary keeps its last trading price.
  for (const [label, contract] of [
    ['Senate control', live.senateControl],
    ['House control', live.houseControl],
  ] as const) {
    if (!contract) continue
    usedIds.add(contract.id)
    const values = fill(undefined).map((_, f) => {
      const rep = marketProbsAtFrame(snapshot.markets[contract.id], f).prob
      return rep === undefined ? undefined : 1 - rep
    })
    const { resolution } = contract
    const result =
      contract.isResolved && (resolution === 'YES' || resolution === 'NO')
        ? {
            value: (resolution === 'NO' ? 1 : 0) as 0 | 1,
            time: contract.resolutionTime,
          }
        : undefined
    timelines.push({
      contractId: contract.id,
      slug: contract.slug,
      creatorUsername: contract.creatorUsername,
      label,
      office: 'control',
      values,
      ...(result && { result }),
    })
  }

  const swings = rankSwings(timelines, times, pollsFrame)
  const file: Swings2026File = {
    generatedAt: Date.now(),
    windowStart: times[0],
    windowEnd: times[lastFrame],
    swings,
  }
  const text = formatFile(file)
  // The hand formatting must round-trip.
  if (JSON.stringify(JSON.parse(text)) !== JSON.stringify(file))
    throw new Error('Formatting changed the data')
  writeFileSync(OUT, text)

  const unused = Object.keys(snapshot.markets).filter((id) => !usedIds.has(id))
  const all = keyBy([...Object.values(bySlug), ...measures], (c) => c.id)
  console.log(
    `${
      timelines.length
    } timelines: races ${resolvedRaces} resolved / ${openRaces} open, measures ${resolvedMeasures} resolved / ${openMeasures} open; ${
      swings.length
    } swings, ${(text.length / 1024).toFixed(1)} KB`
  )
  console.log(
    `Skipped, not a two-party race a week out (${
      skipped.notTwoParty.length
    }): ${skipped.notTwoParty.join(', ')}`
  )
  if (skipped.otherWinner.length)
    console.log(
      `Skipped, won by neither major party: ${skipped.otherWinner.join(', ')}`
    )
  if (unused.length)
    console.log(
      `Snapshot markets not used (${unused.length}): ${unused
        .map((id) => all[id]?.slug ?? id)
        .join(', ')}`
    )
  for (const s of swings)
    console.log(
      `${s.office.padEnd(8)} ${s.label.padEnd(36)} ${s.sideLabel.padEnd(
        11
      )} ${pct(s.from)} → ${s.resolved ? 'won' : pct(s.to)} (polls close ${pct(
        s.pollsClose
      )})`
    )
  // Sanity: every sparkline starts at `from` and keeps time order.
  for (const s of swings) {
    if (s.points[0]?.[1] !== s.from) throw new Error(`${s.label}: bad start`)
    for (let i = 1; i < s.points.length; i++)
      if (s.points[i][0] <= s.points[i - 1][0])
        throw new Error(`${s.label}: time goes backwards`)
    if (
      s.resolved &&
      s.points[s.points.length - 1][0] < file.windowEnd + MINUTE_MS
    )
      throw new Error(`${s.label}: result point inside the window`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
