import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { groupBy, mapValues } from 'lodash'

import { log } from 'shared/utils'
import { LimitBet } from 'common/bet'
import { CPMM } from 'common/contract'
import { DAY_MS } from 'common/util/time'
import { computeElasticity } from 'common/calculate-metrics'
import { hasChanges } from 'common/util/object'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { getAll } from 'shared/supabase/utils'
import { secrets } from 'common/secrets'

export const updateContractMetrics = functions
  .runWith({
    memory: '1GB',
    timeoutSeconds: 540,
    secrets,
  })
  .pubsub.schedule('every 15 minutes')
  .onRun(async () => {
    await updateContractMetricsCore()
  })

export async function updateContractMetricsCore() {
  const firestore = admin.firestore()
  const pg = createSupabaseDirectClient()
  log('Loading contract data...')
  const contracts = await getAll(pg, 'contracts')
  log(`Loaded ${contracts.length} contracts.`)

  const now = Date.now()
  const dayAgo = now - DAY_MS
  const weekAgo = now - 7 * DAY_MS
  const monthAgo = now - 30 * DAY_MS

  log('Loading current contract probabilities...')
  const contractProbs = await getCurrentProbs(pg)

  log('Loading historic contract probabilities...')
  const [dayAgoProbs, weekAgoProbs, monthAgoProbs] = await Promise.all(
    [dayAgo, weekAgo, monthAgo].map((t) => getBetProbsAt(pg, t))
  )

  log('Loading volume...')
  const volume = await getVolumeSince(pg, dayAgo)

  log('Loading unfilled limits...')
  const limits = await getUnfilledLimitOrders(pg)

  log('Computing metric updates...')
  const writer = firestore.bulkWriter()
  for (const contract of contracts) {
    let cpmmFields: Partial<CPMM> = {}
    if (contract.mechanism === 'cpmm-1') {
      const { poolProb, resProb, resTime } = contractProbs[contract.id]
      const prob = resProb ?? poolProb
      const dayAgoProb = dayAgoProbs[contract.id] ?? poolProb
      const weekAgoProb = weekAgoProbs[contract.id] ?? poolProb
      const monthAgoProb = monthAgoProbs[contract.id] ?? poolProb
      cpmmFields = {
        prob,
        probChanges: {
          day: (resTime && resTime <= dayAgo) ? 0 : (prob - dayAgoProb),
          week: (resTime && resTime <= weekAgo) ? 0 : (prob - weekAgoProb),
          month: (resTime && resTime <= monthAgo) ? 0 : (prob - monthAgoProb)
        },
      }
    }
    const elasticity = computeElasticity(limits[contract.id] ?? [], contract)
    const update = {
      volume24Hours: volume[contract.id] ?? 0,
      elasticity,
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
      `select contract_id, sum(abs(amount)) as volume
      from contract_bets
      where created_time >= millis_to_ts($1)
      and not is_redemption
      and not is_ante
      group by contract_id`,
      [since],
      (r) => [r.contract_id as string, parseFloat(r.volume as string)]
    )
  )
}

const getCurrentProbs = async (pg: SupabaseDirectClient) => {
  return Object.fromEntries(
    await pg.map(
      `select
         id, resolution_time as res_time,
         get_cpmm_pool_prob(data->'pool', (data->>'p')::numeric) as pool_prob,
         case when resolution = 'YES' then 1
              when resolution = 'NO' then 0
              when resolution = 'MKT' then resolution_probability
              else null end as res_prob
      from contracts
      where mechanism = 'cpmm-1'`,
      [],
      (r) => [
        r.id as string,
        {
          resTime: r.res_time != null ? Date.parse(r.res_time as string) : null,
          resProb: r.res_prob != null ? parseFloat(r.res_prob as string) : null,
          poolProb: parseFloat(r.pool_prob)
        },
      ]
    )
  )
}

const getBetProbsAt = async (pg: SupabaseDirectClient, when: number) => {
  return Object.fromEntries(
    await pg.map(
      `with probs_before as (
        select distinct on (contract_id) contract_id, prob_after as prob
        from contract_bets
        where created_time < millis_to_ts($1)
        order by contract_id, created_time desc
      ), probs_after as (
        select distinct on (contract_id) contract_id, prob_before as prob
        from contract_bets
        where created_time >= millis_to_ts($1)
        order by contract_id, created_time asc
      )
      select
        coalesce(pa.contract_id, pb.contract_id) as contract_id,
        coalesce(pa.prob, pb.prob) as prob
      from probs_after as pa
      full outer join probs_before as pb on pa.contract_id = pb.contract_id`,
      [when],
      (r) => [r.contract_id as string, parseFloat(r.prob as string)]
    )
  )
}
