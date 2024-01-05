import * as admin from 'firebase-admin'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { JobContext } from 'shared/utils'
import { getAll } from 'shared/supabase/utils'
import { Answer } from 'common/answer'
import { DAY_MS, MONTH_MS, WEEK_MS } from 'common/util/time'
import { CPMM } from 'common/contract'
import { computeElasticity } from 'common/calculate-metrics'
import { hasChanges } from 'common/util/object'
import { groupBy, mapValues } from 'lodash'
import { LimitBet } from 'common/bet'
import { filterDefined } from 'common/util/array'
import { replicateAnswers } from 'shared/supabase/answers'

export async function updateContractMetricsCore({ log }: JobContext) {
  const firestore = admin.firestore()
  const pg = createSupabaseDirectClient()
  log('Loading contract data...')
  const contracts = await getAll(pg, 'contracts')
  const answers = await pg.map(
    `select data from answers`,
    [],
    (r) => r.data as Answer
  )
  log(`Loaded ${contracts.length} contracts.`)

  const now = Date.now()
  const dayAgo = now - DAY_MS
  const weekAgo = now - WEEK_MS
  const monthAgo = now - MONTH_MS

  const allContractAnswerIds = answers.map((a) => a.id)
  const recentBets = await pg.map(
    `select distinct answer_id, contract_id from contract_bets
            where created_time >= millis_to_ts($1)
              and answer_id is not null
              and answer_id != 'undefined'
            `,
    [now - MONTH_MS * 3],
    (r) => ({
      answerId: r.answer_id as string,
      contractId: r.contract_id as string,
    })
  )
  const recentBetOnAnswerIds = recentBets.map((b) => b.answerId)
  const missingAnswerIds = recentBetOnAnswerIds.filter(
    (id) => !allContractAnswerIds.includes(id)
  )
  if (missingAnswerIds.length > 0) {
    log(`Missing ${missingAnswerIds.length} answers, fetching from Firebase...`)
    const answersFromFirebaseSnap = await Promise.all(
      missingAnswerIds.map((id) =>
        firestore
          .collection(
            `contracts/${
              recentBets.find((b) => b.answerId === id)?.contractId
            }/answersCpmm`
          )
          .doc(id)
          .get()
      )
    )
    const answersFromFirebase = filterDefined(
      answersFromFirebaseSnap.map((snap) => snap.data() as Answer)
    )
    await replicateAnswers(pg, answersFromFirebase)
    answers.push(...answersFromFirebase)
  }

  log('Loading current contract probabilities...')
  const currentContractProbs = await getCurrentProbs(pg)
  const currentAnswerProbs = Object.fromEntries(
    answers.map((a) => [
      a.id,
      {
        resTime: a?.resolutionTime ?? null,
        resProb:
          a?.resolution === 'YES' ? 1 : a?.resolution === 'NO' ? 0 : null,
        poolProb: a.prob ?? 0.5,
      },
    ])
  )

  log('Loading historic contract probabilities...')
  const [dayAgoProbs, weekAgoProbs, monthAgoProbs] = await Promise.all(
    [dayAgo, weekAgo, monthAgo].map((t) => getBetProbsAt(pg, t))
  )
  const [dayAgoAnswerProbs, weekAgoAnswerProbs, monthAgoAnswerProbs] =
    await Promise.all(
      [dayAgo, weekAgo, monthAgo].map((t) => getAnswerProbsAt(pg, t))
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
      const { poolProb, resProb, resTime } = currentContractProbs[contract.id]
      const prob = resProb ?? poolProb
      const dayAgoProb = dayAgoProbs[contract.id] ?? poolProb
      const weekAgoProb = weekAgoProbs[contract.id] ?? poolProb
      const monthAgoProb = monthAgoProbs[contract.id] ?? poolProb
      cpmmFields = {
        prob,
        probChanges: {
          day: resTime && resTime <= dayAgo ? 0 : prob - dayAgoProb,
          week: resTime && resTime <= weekAgo ? 0 : prob - weekAgoProb,
          month: resTime && resTime <= monthAgo ? 0 : prob - monthAgoProb,
        },
      }
    } else if (contract.mechanism === 'cpmm-multi-1') {
      const contractAnswers = answers.filter(
        (a) => a.contractId === contract.id
      )
      for (const answer of contractAnswers) {
        const { poolProb, resProb, resTime } = currentAnswerProbs[answer.id]
        const prob = resProb ?? poolProb
        const dayAgoProb = dayAgoAnswerProbs[answer.id] ?? poolProb
        const weekAgoProb = weekAgoAnswerProbs[answer.id] ?? poolProb
        const monthAgoProb = monthAgoAnswerProbs[answer.id] ?? poolProb
        const answerCpmmFields = {
          probChanges: {
            day: resTime && resTime <= dayAgo ? 0 : prob - dayAgoProb,
            week: resTime && resTime <= weekAgo ? 0 : prob - weekAgoProb,
            month: resTime && resTime <= monthAgo ? 0 : prob - monthAgoProb,
          },
        }
        const answerDoc = firestore
          .collection('contracts')
          .doc(contract.id)
          .collection('answersCpmm')
          .doc(answer.id)
        if (hasChanges(answer, answerCpmmFields)) {
          writer.update(answerDoc, answerCpmmFields)
        }
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
      where mechanism = 'cpmm-1'
      `,
      [],
      (r) => [
        r.id as string,
        {
          resTime: r.res_time != null ? Date.parse(r.res_time as string) : null,
          resProb: r.res_prob != null ? parseFloat(r.res_prob as string) : null,
          poolProb: parseFloat(r.pool_prob),
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
      full outer join probs_before as pb on pa.contract_id = pb.contract_id
      `,
      [when],
      (r) => [r.contract_id as string, parseFloat(r.prob as string)]
    )
  )
}

const getAnswerProbsAt = async (pg: SupabaseDirectClient, when: number) => {
  return Object.fromEntries(
    await pg.map(
      `with probs_before as (
        select distinct on (answer_id) answer_id, prob_after as prob
        from contract_bets
        where created_time < millis_to_ts($1)
        order by answer_id, created_time desc
      ), probs_after as (
        select distinct on (answer_id) answer_id, prob_before as prob
        from contract_bets
        where created_time >= millis_to_ts($1)
        order by answer_id, created_time asc
      )
      select
        coalesce(pa.answer_id, pb.answer_id) as answer_id,
        coalesce(pa.prob, pb.prob) as prob
      from probs_after as pa
      full outer join probs_before as pb on pa.answer_id = pb.answer_id
      `,
      [when],
      (r) => [r.answer_id as string, parseFloat(r.prob as string)]
    )
  )
}
