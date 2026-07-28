import * as admin from 'firebase-admin'
import { keyBy, sumBy } from 'lodash'

import { PerpContract } from 'common/contract'
import { ENV, ENV_CONFIG } from 'common/envs/constants'
import { isPerpEscrowBalanced } from 'common/perps/escrow'
import {
  READ_ONLY_REPEATABLE_MODE,
  SERIAL_MODE,
  SupabaseDirectClientTimeout,
  SupabaseTransaction,
} from 'shared/supabase/init'
import { calculatePerpPeriodMetricUpdates } from 'shared/perps/user-contract-metric-periods'
import { log } from 'shared/utils'

import { runScript } from './run-script'

// One-shot cleanup of the exact resolved DEV PERP prototypes and scratch
// markets that predate the launch-ready accounting history.
//
// Default invocation is read-only:
//
//   $env:NEXT_PUBLIC_FIREBASE_ENV = 'DEV'
//   npx.cmd ts-node cleanup-retired-perps-dev.ts
//
// Applying requires both flags:
//
//   $env:NEXT_PUBLIC_FIREBASE_ENV = 'DEV'
//   npx.cmd ts-node cleanup-retired-perps-dev.ts `
//     --apply --confirm=CLEAN-RETIRED-DEV-PERPS
//
// Apply mode changes only:
//   - the top-level deleted flag and contracts.data for the 27 pinned
//     resolved contracts, marking them deleted, unlisted, and unranked; and
//   - the 45 derived user_contract_metrics rows owned by those contracts.
//
// PERP events, funding history, txns, balances, embeddings, topics,
// notifications, and contract edit history are deliberately retained.

const APPLY_CONFIRMATION = '--confirm=CLEAN-RETIRED-DEV-PERPS'
const APPLY = process.argv.includes('--apply')
const DEV_MANIFOLD = 'MxyCh2xvsFMFywwjg3Az0w4xP5B3'
const EXPECTED_METRIC_COUNT = 45
const EXPECTED_NON_REPLAYABLE_METRIC_COUNT = 19

type PinnedContract = {
  id: string
  slug: string
  feedId: string
}

type RetiredContract = PinnedContract & {
  metricCount: number
  visibility: 'public' | 'unlisted'
}

const KEEP_CONTRACTS: readonly PinnedContract[] = [
  {
    id: 'n98l6pzCNUIO',
    slug: 'bitcoin-price-usd-5UhA',
    feedId: 'btc-usd',
  },
  {
    id: 'zlg8CpOl290P',
    slug: 'uk-grid-carbon-intensity-gcokwh',
    feedId: 'uk-grid-carbon',
  },
  {
    id: 'ALhU6qIL6Oun',
    slug: 'trump-approval-rating-h2yt',
    feedId: 'trump-approval-rating',
  },
  {
    id: 'ydAULhqg58A0',
    slug: 'openweight-ai-token-share-on-openro',
    feedId: 'openrouter-open-weight-share',
  },
]

const RETIRED_CONTRACTS: readonly RetiredContract[] = [
  {
    id: 'sRdQ8AhIStLR',
    slug: 'manifold-daus',
    feedId: 'manifold-dau',
    metricCount: 1,
    visibility: 'public',
  },
  {
    id: 'dnyI0n9zCAzz',
    slug: 'trump-approval-rating',
    feedId: 'trump-approval-rating',
    metricCount: 3,
    visibility: 'public',
  },
  {
    id: 'dC98lsd0tP5Z',
    slug: 'epoch-ai-capabilities-index-frontie',
    feedId: 'eci-frontier',
    metricCount: 3,
    visibility: 'public',
  },
  {
    id: 'OE6uhhZQpI8R',
    slug: 'bitcoin-usd-perpetual',
    feedId: 'btc-usd',
    metricCount: 4,
    visibility: 'public',
  },
  {
    id: 'SSyOOz9ldQu5',
    slug: 'uk-grid-carbon-intensity-gco2kwh-pe',
    feedId: 'uk-grid-carbon',
    metricCount: 4,
    visibility: 'public',
  },
  {
    id: 'SNdcAsZd2QLR',
    slug: 'perp-drill-1785067184-liquidation-s',
    feedId: 'drill-liq-1785067184',
    metricCount: 2,
    visibility: 'unlisted',
  },
  {
    id: 'UqO9C9OQs0tC',
    slug: 'perp-drill-1785067184-adl-scratch-i',
    feedId: 'drill-adl-1785067184',
    metricCount: 2,
    visibility: 'unlisted',
  },
  {
    id: '2Cd9c68L5OzR',
    slug: 'perp-drill-1785067184-stalegate-scr',
    feedId: 'drill-stale-1785067184',
    metricCount: 1,
    visibility: 'unlisted',
  },
  {
    id: 'Q800syngUh2c',
    slug: 'perp-drill-1785067676-liquidation-s',
    feedId: 'drill-liq-1785067676',
    metricCount: 2,
    visibility: 'unlisted',
  },
  {
    id: '9lR55tZ0tICS',
    slug: 'perp-drill-1785067676-adl-scratch-i',
    feedId: 'drill-adl-1785067676',
    metricCount: 2,
    visibility: 'unlisted',
  },
  {
    id: 'hgC9nSUtCCtA',
    slug: 'perp-drill-1785067676-stalegate-scr',
    feedId: 'drill-stale-1785067676',
    metricCount: 1,
    visibility: 'unlisted',
  },
  {
    id: 'uhsnSZ0yUSgZ',
    slug: 'perp-drill-1785067804-liquidation-s',
    feedId: 'drill-liq-1785067804',
    metricCount: 2,
    visibility: 'unlisted',
  },
  {
    id: 'nIIRZpcuyptg',
    slug: 'perp-drill-1785067804-adl-scratch-i',
    feedId: 'drill-adl-1785067804',
    metricCount: 2,
    visibility: 'unlisted',
  },
  {
    id: 'UuyCEtnzLg0y',
    slug: 'perp-drill-1785067804-stalegate-scr',
    feedId: 'drill-stale-1785067804',
    metricCount: 1,
    visibility: 'unlisted',
  },
  {
    id: 'LCOhny065NRg',
    slug: 'trump-approval-rating-EhsE',
    feedId: 'trump-approval-rating',
    metricCount: 1,
    visibility: 'public',
  },
  {
    id: '8AguZ5yULcNQ',
    slug: 'open-vs-closed-ai-openweight-share',
    feedId: 'openrouter-open-weight-share',
    metricCount: 1,
    visibility: 'public',
  },
  {
    id: 'ZucCZdUg6cZR',
    slug: 'bitcoin-price-usd',
    feedId: 'btc-usd',
    metricCount: 1,
    visibility: 'unlisted',
  },
  {
    id: 'yPZtPS5N5gO5',
    slug: 'perp-dev-drill-1785230942201zpu5-wo',
    feedId: 'perp-dev-drill-1785230942201-ZPu5-workflow',
    metricCount: 1,
    visibility: 'unlisted',
  },
  {
    id: '98Iluunz9Ult',
    slug: 'perp-dev-drill-1785231168477tydn-wo',
    feedId: 'perp-dev-drill-1785231168477-tydN-workflow',
    metricCount: 1,
    visibility: 'unlisted',
  },
  {
    id: '0IQuA0tpRZQC',
    slug: 'perp-dev-drill-1785230942201zpu5-li',
    feedId: 'perp-dev-drill-1785230942201-ZPu5-liquidation',
    metricCount: 1,
    visibility: 'unlisted',
  },
  {
    id: 'd8Nh9ldsEEqz',
    slug: 'perp-dev-drill-1785230942201zpu5-ad',
    feedId: 'perp-dev-drill-1785230942201-ZPu5-adl-and-resolution',
    metricCount: 2,
    visibility: 'unlisted',
  },
  {
    id: 'Egn8pQl85y9u',
    slug: 'perp-dev-drill-1785230942201zpu5-re',
    feedId: 'perp-dev-drill-1785230942201-ZPu5-resolution-liquidation',
    metricCount: 1,
    visibility: 'unlisted',
  },
  {
    id: 'lUsLIzuEQhCu',
    slug: 'perp-dev-drill-1785230942201zpu5-st',
    feedId: 'perp-dev-drill-1785230942201-ZPu5-stale-gate',
    metricCount: 1,
    visibility: 'unlisted',
  },
  {
    id: 'AAzpZ8PcU66s',
    slug: 'perp-dev-drill-1785231168477tydn-li',
    feedId: 'perp-dev-drill-1785231168477-tydN-liquidation',
    metricCount: 1,
    visibility: 'unlisted',
  },
  {
    id: 'UsgQZNOSSuqA',
    slug: 'perp-dev-drill-1785231168477tydn-ad',
    feedId: 'perp-dev-drill-1785231168477-tydN-adl-and-resolution',
    metricCount: 2,
    visibility: 'unlisted',
  },
  {
    id: 'Z9zPESR26qLS',
    slug: 'perp-dev-drill-1785231168477tydn-re',
    feedId: 'perp-dev-drill-1785231168477-tydN-resolution-liquidation',
    metricCount: 1,
    visibility: 'unlisted',
  },
  {
    id: '5ZO0dQnA2RZh',
    slug: 'perp-dev-drill-1785231168477tydn-st',
    feedId: 'perp-dev-drill-1785231168477-tydN-stale-gate',
    metricCount: 1,
    visibility: 'unlisted',
  },
]

type ContractRow = {
  id: string
  slug: string
  visibility: string
  deleted: boolean
  mechanism: string
  outcome_type: string
  resolution: string | null
  resolution_time: string | null
  token: string
  data: PerpContract
  data_text: string
}

type ContractStateRow = {
  id: string
  position_count: number | string
  metric_count: number | string
  answer_metric_count: number | string
  event_count: number | string
  event_max_id: string | null
  funding_count: number | string
  funding_max_ts: string | null
  txn_count: number | string
  txn_amount: number | string
  ledger_balance: number | string
}

type BalanceRow = {
  id: string
  balance: number | string
}

type CleanupPhase = 'fresh' | 'cleaned'

type Inspection = {
  phase: CleanupPhase
  contracts: ContractRow[]
  states: ContractStateRow[]
  balances: BalanceRow[]
  keepFingerprint: string
  historyFingerprint: string
  balanceFingerprint: string
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const asFiniteNumber = (value: number | string, label: string) => {
  const number = Number(value)
  assert(Number.isFinite(number), `${label} is not finite: ${value}`)
  return number
}

const sortedIds = (ids: string[]) => ids.slice().sort().join(',')

const assertExactIds = (
  actual: string[],
  expected: string[],
  label: string
) => {
  const actualIds = sortedIds(actual)
  const expectedIds = sortedIds(expected)
  assert(
    actualIds === expectedIds,
    `${label} mismatch: actual=[${actualIds}], expected=[${expectedIds}]`
  )
}

const contractFingerprint = (rows: ContractRow[]) =>
  JSON.stringify(
    rows
      .map((row) => ({
        id: row.id,
        slug: row.slug,
        visibility: row.visibility,
        deleted: row.deleted,
        mechanism: row.mechanism,
        outcomeType: row.outcome_type,
        resolution: row.resolution,
        resolutionTime: row.resolution_time,
        token: row.token,
        data: row.data_text,
      }))
      .sort((a, b) => a.id.localeCompare(b.id))
  )

const historyFingerprint = (states: ContractStateRow[]) =>
  JSON.stringify(
    states
      .map((row) => ({
        id: row.id,
        eventCount: String(row.event_count),
        eventMaxId: row.event_max_id,
        fundingCount: String(row.funding_count),
        fundingMaxTs: row.funding_max_ts,
        txnCount: String(row.txn_count),
        txnAmount: String(row.txn_amount),
      }))
      .sort((a, b) => a.id.localeCompare(b.id))
  )

const balanceFingerprint = (rows: BalanceRow[]) =>
  JSON.stringify(
    rows
      .map((row) => ({ id: row.id, balance: String(row.balance) }))
      .sort((a, b) => a.id.localeCompare(b.id))
  )

const loadInspection = async (
  tx: SupabaseTransaction,
  lockContracts: boolean
): Promise<Inspection> => {
  const contracts = await tx.manyOrNone<ContractRow>(
    `select id, slug, visibility, deleted, mechanism, outcome_type,
            resolution, resolution_time, token, data, data::text as data_text
       from contracts
      where mechanism = 'perp'
      order by id
      ${lockContracts ? 'for update' : ''}`
  )
  const pinnedIds = [
    ...KEEP_CONTRACTS.map((contract) => contract.id),
    ...RETIRED_CONTRACTS.map((contract) => contract.id),
  ]
  const pinnedContracts = contracts.filter((row) => pinnedIds.includes(row.id))
  const extraContracts = contracts.filter((row) => !pinnedIds.includes(row.id))
  const unresolved = pinnedContracts.filter(
    (row) => row.resolution_time === null
  )
  const resolved = pinnedContracts.filter((row) => row.resolution_time !== null)
  assertExactIds(
    unresolved.map((row) => row.id),
    KEEP_CONTRACTS.map((contract) => contract.id),
    'unresolved PERP set'
  )
  assertExactIds(
    resolved.map((row) => row.id),
    RETIRED_CONTRACTS.map((contract) => contract.id),
    'resolved PERP set'
  )

  const allIds = contracts.map((row) => row.id)
  const states = await tx.manyOrNone<ContractStateRow>(
    `select c.id,
            (select count(*) from contract_perp_positions p
              where p.contract_id = c.id)::int as position_count,
            (select count(*) from user_contract_metrics ucm
              where ucm.contract_id = c.id)::int as metric_count,
            (select count(*) from user_contract_metrics ucm
              where ucm.contract_id = c.id
                and ucm.answer_id is not null)::int as answer_metric_count,
            (select count(*) from contract_perp_events e
              where e.contract_id = c.id)::int as event_count,
            (select max(e.id)::text from contract_perp_events e
              where e.contract_id = c.id) as event_max_id,
            (select count(*) from contract_perp_funding_events f
              where f.contract_id = c.id)::int as funding_count,
            (select max(f.ts)::text from contract_perp_funding_events f
              where f.contract_id = c.id) as funding_max_ts,
            (select count(*) from txns t
              where (t.from_type = 'CONTRACT' and t.from_id = c.id)
                 or (t.to_type = 'CONTRACT' and t.to_id = c.id))::int
              as txn_count,
            (select coalesce(sum(t.amount), 0) from txns t
              where (t.from_type = 'CONTRACT' and t.from_id = c.id)
                 or (t.to_type = 'CONTRACT' and t.to_id = c.id))
              as txn_amount,
            (select coalesce(sum(
               case
                 when t.to_type = 'CONTRACT' and t.to_id = c.id
                   then t.amount
                 when t.from_type = 'CONTRACT' and t.from_id = c.id
                   then -t.amount
                 else 0
               end
             ), 0)
             from txns t
             where t.token = 'M$'
               and (
                 (t.to_type = 'CONTRACT' and t.to_id = c.id)
                 or (t.from_type = 'CONTRACT' and t.from_id = c.id)
               )) as ledger_balance
       from contracts c
      where c.id = any($1::text[])
      order by c.id`,
    [allIds]
  )
  assertExactIds(
    states.map((row) => row.id),
    allIds,
    'PERP state rows'
  )

  const rowsById = keyBy(contracts, 'id')
  const statesById = keyBy(states, 'id')
  for (const pinned of KEEP_CONTRACTS) {
    const row = rowsById[pinned.id]
    const state = statesById[pinned.id]
    assert(row !== undefined, `Missing keep contract ${pinned.id}`)
    assert(state !== undefined, `Missing keep state ${pinned.id}`)
    assert(
      row.slug === pinned.slug &&
        row.data.slug === pinned.slug &&
        row.data.oracleFeedId === pinned.feedId,
      `Keep identity mismatch for ${pinned.id}`
    )
    assert(
      row.mechanism === 'perp' &&
        row.data.mechanism === 'perp' &&
        row.outcome_type === 'PERP' &&
        row.data.outcomeType === 'PERP' &&
        row.token === 'MANA' &&
        row.data.creatorId === DEV_MANIFOLD,
      `Keep product identity mismatch for ${pinned.id}`
    )
    assert(
      row.resolution_time === null &&
        row.resolution === null &&
        !row.data.isResolved,
      `Keep contract ${pinned.id} is unexpectedly resolved`
    )
    assert(
      !row.deleted &&
        !row.data.deleted &&
        row.visibility === 'unlisted' &&
        row.data.visibility === 'unlisted',
      `Keep contract ${pinned.id} is not clean and unlisted`
    )
    assert(
      asFiniteNumber(state.position_count, `${pinned.id} positions`) === 0 &&
        asFiniteNumber(state.metric_count, `${pinned.id} metrics`) === 0 &&
        asFiniteNumber(state.event_count, `${pinned.id} events`) === 0,
      `Keep contract ${pinned.id} is not pristine`
    )
    const poolLong = asFiniteNumber(row.data.poolLong, `${pinned.id} poolLong`)
    const poolShort = asFiniteNumber(
      row.data.poolShort,
      `${pinned.id} poolShort`
    )
    const ledgerBalance = asFiniteNumber(
      state.ledger_balance,
      `${pinned.id} ledger`
    )
    assert(
      isPerpEscrowBalanced({ ledgerBalance, poolLong, poolShort }),
      `Keep contract ${
        pinned.id
      } fails escrow solvency: ledger=${ledgerBalance}, pools=${
        poolLong + poolShort
      }`
    )
  }

  for (const pinned of RETIRED_CONTRACTS) {
    const row = rowsById[pinned.id]
    const state = statesById[pinned.id]
    assert(row !== undefined, `Missing retired contract ${pinned.id}`)
    assert(state !== undefined, `Missing retired state ${pinned.id}`)
    assert(
      row.slug === pinned.slug &&
        row.data.slug === pinned.slug &&
        row.data.oracleFeedId === pinned.feedId,
      `Retired identity mismatch for ${pinned.id}`
    )
    assert(
      row.mechanism === 'perp' &&
        row.data.mechanism === 'perp' &&
        row.outcome_type === 'PERP' &&
        row.data.outcomeType === 'PERP' &&
        row.token === 'MANA' &&
        row.data.creatorId === DEV_MANIFOLD &&
        row.data.siblingContractId === undefined,
      `Retired product identity mismatch for ${pinned.id}`
    )
    assert(
      row.resolution_time !== null &&
        row.resolution === 'MKT' &&
        row.data.isResolved &&
        row.data.resolution === 'MKT',
      `Retired contract ${pinned.id} is not MKT-resolved`
    )
    const poolLong = asFiniteNumber(row.data.poolLong, `${pinned.id} poolLong`)
    const poolShort = asFiniteNumber(
      row.data.poolShort,
      `${pinned.id} poolShort`
    )
    const ledgerBalance = asFiniteNumber(
      state.ledger_balance,
      `${pinned.id} ledger`
    )
    assert(
      poolLong === 0 &&
        poolShort === 0 &&
        asFiniteNumber(state.position_count, `${pinned.id} positions`) === 0 &&
        isPerpEscrowBalanced({ ledgerBalance, poolLong, poolShort }),
      `Retired contract ${pinned.id} is not fully settled: positions=${
        state.position_count
      }, ledger=${ledgerBalance}, pools=${poolLong + poolShort}`
    )
    assert(
      asFiniteNumber(state.event_count, `${pinned.id} events`) > 0,
      `Retired contract ${pinned.id} has no immutable event history`
    )
    assert(
      asFiniteNumber(
        state.answer_metric_count,
        `${pinned.id} answer metrics`
      ) === 0,
      `Retired contract ${pinned.id} unexpectedly has answer-specific metrics`
    )
  }

  for (const row of extraContracts) {
    const state = statesById[row.id]
    assert(state !== undefined, `Missing extra drill state ${row.id}`)
    const poolLong = asFiniteNumber(row.data.poolLong, `${row.id} poolLong`)
    const poolShort = asFiniteNumber(row.data.poolShort, `${row.id} poolShort`)
    const ledgerBalance = asFiniteNumber(
      state.ledger_balance,
      `${row.id} ledger`
    )
    assert(
      row.mechanism === 'perp' &&
        row.data.mechanism === 'perp' &&
        row.outcome_type === 'PERP' &&
        row.data.outcomeType === 'PERP' &&
        row.token === 'MANA' &&
        row.data.creatorId === DEV_MANIFOLD &&
        row.resolution_time !== null &&
        row.resolution === 'MKT' &&
        row.data.isResolved &&
        row.data.resolution === 'MKT' &&
        row.deleted &&
        row.data.deleted === true &&
        row.visibility === 'unlisted' &&
        row.data.visibility === 'unlisted' &&
        row.data.isRanked === false &&
        row.data.question.startsWith('PERP DEV DRILL ') &&
        row.data.oracleFeedId.startsWith('perp-dev-drill-') &&
        poolLong === 0 &&
        poolShort === 0 &&
        asFiniteNumber(state.position_count, `${row.id} positions`) === 0 &&
        asFiniteNumber(state.metric_count, `${row.id} metrics`) === 0 &&
        asFiniteNumber(state.event_count, `${row.id} events`) > 0 &&
        isPerpEscrowBalanced({ ledgerBalance, poolLong, poolShort }),
      `Unexpected extra PERP contract ${row.id}; only fully retired future drill markets are allowed`
    )
  }

  const freshContracts = RETIRED_CONTRACTS.every((pinned) => {
    const row = rowsById[pinned.id]
    return (
      !row.deleted &&
      !row.data.deleted &&
      row.visibility === pinned.visibility &&
      row.data.visibility === pinned.visibility
    )
  })
  const cleanedContracts = RETIRED_CONTRACTS.every((pinned) => {
    const row = rowsById[pinned.id]
    return (
      row.deleted &&
      row.data.deleted === true &&
      row.visibility === 'unlisted' &&
      row.data.visibility === 'unlisted' &&
      row.data.isRanked === false
    )
  })
  const freshMetrics = RETIRED_CONTRACTS.every(
    (pinned) =>
      asFiniteNumber(
        statesById[pinned.id].metric_count,
        `${pinned.id} metric count`
      ) === pinned.metricCount
  )
  const cleanedMetrics = RETIRED_CONTRACTS.every(
    (pinned) =>
      asFiniteNumber(
        statesById[pinned.id].metric_count,
        `${pinned.id} metric count`
      ) === 0
  )
  const phase: CleanupPhase =
    freshContracts && freshMetrics
      ? 'fresh'
      : cleanedContracts && cleanedMetrics
      ? 'cleaned'
      : (() => {
          throw new Error(
            'Retired PERP cleanup state is partial or drifted; refusing to continue'
          )
        })()

  const totalMetrics = sumBy(RETIRED_CONTRACTS, (pinned) =>
    asFiniteNumber(
      statesById[pinned.id].metric_count,
      `${pinned.id} metric count`
    )
  )
  assert(
    totalMetrics === (phase === 'fresh' ? EXPECTED_METRIC_COUNT : 0),
    `Retired metric total is ${totalMetrics}; expected ${
      phase === 'fresh' ? EXPECTED_METRIC_COUNT : 0
    }`
  )

  const retiredIds = RETIRED_CONTRACTS.map((contract) => contract.id)
  const balances = await tx.manyOrNone<BalanceRow>(
    `select id, balance
       from users
      where id in (
        select creator_id
          from contracts
         where id = any($1::text[])
        union
        select user_id
          from contract_perp_events
         where contract_id = any($1::text[])
           and user_id is not null
      )
      order by id`,
    [retiredIds]
  )

  return {
    phase,
    contracts,
    states,
    balances,
    keepFingerprint: contractFingerprint(
      KEEP_CONTRACTS.map((pinned) => rowsById[pinned.id])
    ),
    historyFingerprint: historyFingerprint(
      RETIRED_CONTRACTS.map((pinned) => statesById[pinned.id])
    ),
    balanceFingerprint: balanceFingerprint(balances),
  }
}

const inspectMetricReplay = async (
  pg: SupabaseDirectClientTimeout,
  phase: CleanupPhase
) => {
  const retiredIds = RETIRED_CONTRACTS.map((contract) => contract.id)
  const targets = await pg.manyOrNone<{
    userId: string
    contractId: string
  }>(
    `select user_id as "userId", contract_id as "contractId"
       from user_contract_metrics
      where contract_id = any($1::text[])
      order by contract_id, user_id`,
    [retiredIds]
  )
  if (phase === 'cleaned') {
    assert(
      targets.length === 0,
      `Cleaned state still has ${targets.length} retired metric rows`
    )
    return { replayable: 0, nonReplayable: 0 }
  }

  assert(
    targets.length === EXPECTED_METRIC_COUNT,
    `Replay inventory found ${targets.length} metrics, expected ${EXPECTED_METRIC_COUNT}`
  )
  const replayable = await calculatePerpPeriodMetricUpdates({ pg, targets })
  const nonReplayable = targets.length - replayable.length
  assert(
    nonReplayable === EXPECTED_NON_REPLAYABLE_METRIC_COUNT,
    `Replay inventory found ${nonReplayable} non-replayable metrics, expected ${EXPECTED_NON_REPLAYABLE_METRIC_COUNT}`
  )
  return { replayable: replayable.length, nonReplayable }
}

const logInspection = (
  inspection: Inspection,
  replay: { replayable: number; nonReplayable: number }
) => {
  const statesById = keyBy(inspection.states, 'id')
  log(
    `STATE: ${inspection.phase}; keep=${KEEP_CONTRACTS.length}; ` +
      `retired=${RETIRED_CONTRACTS.length}; replayable metrics=${replay.replayable}; ` +
      `non-replayable metrics=${replay.nonReplayable}`
  )
  for (const pinned of RETIRED_CONTRACTS) {
    const state = statesById[pinned.id]
    log(
      `  ${pinned.id} ${pinned.slug}: metrics=${state.metric_count}, ` +
        `events=${state.event_count}, funding=${state.funding_count}, ` +
        `txns=${state.txn_count}`
    )
  }
}

if (require.main === module)
  runScript(async ({ pg }) => {
    const projectId = admin.app().options.projectId
    assert(
      ENV === 'DEV' &&
        projectId === ENV_CONFIG.firebaseConfig.projectId &&
        projectId === 'dev-mantic-markets',
      `DEV guard failed (ENV=${ENV}, Firebase=${projectId ?? 'missing'})`
    )

    const unknownArgs = process.argv
      .slice(2)
      .filter((arg) => arg !== '--apply' && arg !== APPLY_CONFIRMATION)
    assert(
      unknownArgs.length === 0,
      `Unknown argument(s): ${unknownArgs.join(', ')}`
    )
    assert(
      APPLY === process.argv.includes(APPLY_CONFIRMATION),
      `Apply mode requires both --apply and ${APPLY_CONFIRMATION}; omit both for a read-only inventory.`
    )
    assert(
      RETIRED_CONTRACTS.length === 27 &&
        sumBy(RETIRED_CONTRACTS, 'metricCount') === EXPECTED_METRIC_COUNT,
      'Pinned cleanup manifest has the wrong contract or metric count'
    )

    const initial = await pg.tx({ mode: READ_ONLY_REPEATABLE_MODE }, (tx) =>
      loadInspection(tx, false)
    )
    const replay = await inspectMetricReplay(pg, initial.phase)
    logInspection(initial, replay)

    if (!APPLY) {
      log(
        initial.phase === 'fresh'
          ? `DRY RUN COMPLETE: would atomically soft-delete/unlist/unrank ${RETIRED_CONTRACTS.length} retired PERPs and delete ${EXPECTED_METRIC_COUNT} derived metric rows. Re-run with --apply ${APPLY_CONFIRMATION}.`
          : 'DRY RUN COMPLETE: cleanup is already complete; an apply rerun would be a verified no-op.'
      )
      return
    }

    const result = await pg.tx({ mode: SERIAL_MODE }, async (tx) => {
      const before = await loadInspection(tx, true)
      if (before.phase === 'cleaned') {
        log('APPLY: cleanup is already complete; verified no-op')
        return { updatedContracts: 0, deletedMetrics: 0 }
      }

      const retiredIds = RETIRED_CONTRACTS.map((contract) => contract.id)
      const updated = await tx.result(
        `update contracts
            set deleted = true,
                data = data || jsonb_build_object(
              'deleted', true,
              'visibility', 'unlisted',
              'isRanked', false
            )
          where id = any($1::text[])
            and mechanism = 'perp'
            and outcome_type = 'PERP'
            and resolution = 'MKT'
            and resolution_time is not null
            and data->>'siblingContractId' is null`,
        [retiredIds]
      )
      assert(
        updated.rowCount === RETIRED_CONTRACTS.length,
        `Updated ${updated.rowCount} retired contracts, expected ${RETIRED_CONTRACTS.length}`
      )

      const deleted = await tx.result(
        `delete from user_contract_metrics
          where contract_id = any($1::text[])`,
        [retiredIds]
      )
      assert(
        deleted.rowCount === EXPECTED_METRIC_COUNT,
        `Deleted ${deleted.rowCount} derived metrics, expected ${EXPECTED_METRIC_COUNT}`
      )

      const after = await loadInspection(tx, true)
      assert(after.phase === 'cleaned', 'Cleanup transaction did not converge')
      assert(
        after.keepFingerprint === before.keepFingerprint,
        'A keep contract changed during cleanup'
      )
      assert(
        after.historyFingerprint === before.historyFingerprint,
        'PERP event, funding, or transaction history changed during cleanup'
      )
      assert(
        after.balanceFingerprint === before.balanceFingerprint,
        'A participant or creator balance changed during cleanup'
      )

      return {
        updatedContracts: updated.rowCount,
        deletedMetrics: deleted.rowCount,
      }
    })

    const final = await pg.tx({ mode: READ_ONLY_REPEATABLE_MODE }, (tx) =>
      loadInspection(tx, false)
    )
    assert(final.phase === 'cleaned', 'Post-commit cleanup state is not clean')
    const finalReplay = await inspectMetricReplay(pg, final.phase)
    assert(
      finalReplay.nonReplayable === 0,
      'Non-replayable retired metrics remain after cleanup'
    )

    log(
      `CLEANUP COMPLETE: updated ${result.updatedContracts} contracts; ` +
        `deleted ${result.deletedMetrics} derived metrics; preserved PERP ` +
        `events, funding, txns, balances, embeddings, topics, notifications, ` +
        `and the four clean launch markets.`
    )
  })
