import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { groupBy, mapValues } from 'lodash'

import { invokeFunction, log } from 'shared/utils'
import { LimitBet } from 'common/bet'
import { CPMM } from 'common/contract'
import { DAY_MS } from 'common/util/time'
import { computeElasticity } from 'common/calculate-metrics'
import { hasChanges } from 'common/util/object'
import { newEndpointNoAuth } from '../api/helpers'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { getAll } from 'shared/supabase/utils'

export const scheduleUpdateContractMetrics = functions.pubsub
  .schedule('every 15 minutes')
  .onRun(async () => {
    try {
      console.log(await invokeFunction('updatecontractmetrics'))
    } catch (e) {
      console.error(e)
    }
  })

export const updatecontractmetrics = newEndpointNoAuth(
  {
    timeoutSeconds: 2000,
    memory: '2GiB',
    minInstances: 0,
    secrets: ['SUPABASE_PASSWORD'],
  },
  async (_req) => {
    await updateContractMetrics()
    return { success: true }
  }
)

export async function updateContractMetrics() {
  const firestore = admin.firestore()
  const pg = createSupabaseDirectClient()
  log('Loading contract data...')
  const contracts = await getAll(pg, 'contracts')
  log(`Loaded ${contracts.length} contracts.`)

  const now = Date.now()
  const yesterday = now - DAY_MS
  const weekAgo = now - 7 * DAY_MS
  const monthAgo = now - 30 * DAY_MS

  log('Loading historic contract probabilities...')
  const [yesterdayProbs, weekAgoProbs, monthAgoProbs] = await Promise.all(
    [yesterday, weekAgo, monthAgo].map((t) => getContractProbsAt(pg, t))
  )

  log('Loading unique bettors...')
  const [yesterdayBettors, weekAgoBettors, monthAgoBettors] = await Promise.all(
    [yesterday, weekAgo, monthAgo].map((t) => getBettorsSince(pg, t))
  )

  log('Loading volume...')
  const volume = await getVolumeSince(pg, yesterday)

  log('Loading unfilled limits...')
  const limits = await getUnfilledLimitOrders(pg)

  log('Computing metric updates...')
  const writer = firestore.bulkWriter()
  for (const contract of contracts) {
    let cpmmFields: Partial<CPMM> = {}
    if (contract.mechanism === 'cpmm-1') {
      const cid = contract.id
      cpmmFields = {
        prob: yesterdayProbs[cid].current,
        probChanges: {
          day: yesterdayProbs[cid].current - yesterdayProbs[cid].historical,
          week: weekAgoProbs[cid].current - weekAgoProbs[cid].historical,
          month: monthAgoProbs[cid].current - monthAgoProbs[cid].historical,
        },
      }
    }
    const isClosed = contract.closeTime && contract.closeTime < now
    const elasticity = computeElasticity(limits[contract.id] ?? [], contract)
    const update = {
      volume24Hours: volume[contract.id] ?? 0,
      elasticity: isClosed ? 0 : elasticity,
      uniqueBettors24Hours: yesterdayBettors[contract.id] ?? 0,
      uniqueBettors7Days: weekAgoBettors[contract.id] ?? 0,
      uniqueBettors30Days: monthAgoBettors[contract.id] ?? 0,
      ...cpmmFields,
    }

    if (hasChanges(contract, update)) {
      const contractDoc = firestore.collection('contracts').doc(contract.id)
      writer.update(contractDoc, update)
    }
  }

  log('Committing writes...')
  await writer.close()
  log('Done.')
}

const getUnfilledLimitOrders = async (pg: SupabaseDirectClient) => {
  const unfilledBets = await pg.manyOrNone(
    `select contract_id, data
    from contract_bets
    where (data->'limitProb')::numeric > 0
    and not (data->'isFilled')::boolean
    and not (data->'isCancelled')::boolean`
  )
  return mapValues(
    groupBy(unfilledBets, (r) => r.contract_id as string),
    (rows) => rows.map((r) => r.data as LimitBet)
  )
}

const getVolumeSince = async (pg: SupabaseDirectClient, since: number) => {
  return Object.fromEntries(
    await pg.map(
      `select contract_id, sum(abs((data->'amount')::numeric)) as volume
      from contract_bets
      where (data->'createdTime')::bigint >= $1
      and not (data->'isRedemption')::boolean
      and not (data->'isAnte')::boolean
      group by contract_id`,
      [since],
      (r) => [r.contract_id as string, parseFloat(r.volume as string)]
    )
  )
}

const getBettorsSince = async (pg: SupabaseDirectClient, since: number) => {
  return Object.fromEntries(
    await pg.map(
      `select contract_id, count(*)::int as n
      from user_contract_metrics
      where (data->'lastBetTime')::bigint > $1
      group by contract_id`,
      [since],
      (r) => [r.contract_id as string, r.n as number]
    )
  )
}

const getContractProbsAt = async (pg: SupabaseDirectClient, when: number) => {
  return Object.fromEntries(
    await pg.map(
      `with probs_before as (
        select distinct on (contract_id) contract_id, (data->>'probAfter')::numeric as prob
        from contract_bets
        where to_jsonb(data)->>'createdTime' < $1::text
        order by contract_id, to_jsonb(data)->>'createdTime' desc
      ), probs_after as (
        select distinct on (contract_id) contract_id, (data->>'probBefore')::numeric as prob
        from contract_bets
        where to_jsonb(data)->>'createdTime' >= $1::text
        order by contract_id, to_jsonb(data)->>'createdTime' asc
      ), current_probs as (
        select id, data,
          get_cpmm_resolved_prob(data) as resolved_prob,
          get_cpmm_pool_prob(data->'pool', (data->>'p')::numeric) as pool_prob
        from contracts
        where data->>'mechanism' = 'cpmm-1'
      )
      select id, coalesce(cp.resolved_prob, cp.pool_prob) as current_prob,
        case
          when data ? 'resolutionTime' and data->>'resolutionTime' <= $1::text
          then coalesce(cp.resolved_prob, cp.pool_prob)
          else coalesce(pa.prob, pb.prob, cp.pool_prob)
        end as historical_prob
      from current_probs as cp
      left join probs_before as pb on pb.contract_id = cp.id
      left join probs_after as pa on pa.contract_id = cp.id`,
      [when],
      (r) => [
        r.id as string,
        {
          current: parseFloat(r.current_prob as string),
          historical: parseFloat(r.historical_prob as string),
        },
      ]
    )
  )
}
