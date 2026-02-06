import { LimitBet } from 'common/bet'
import { computeElasticity } from 'common/calculate-metrics'
import { Contract, CPMM } from 'common/contract'
import { convertAnswer, convertContract } from 'common/supabase/contracts'
import { hasChanges } from 'common/util/object'
import { DAY_MS, MONTH_MS, WEEK_MS } from 'common/util/time'
import { chunk, groupBy, mapValues } from 'lodash'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { contractColumnsToSelect, log } from 'shared/utils'
import { bulkUpdateAnswers } from './supabase/answers'
import { bulkUpdateData } from './supabase/utils'

export async function updateContractMetricsCore(wholeMonth: boolean = false) {
  const pg = createSupabaseDirectClient()
  log('Loading contract data...')
  const timeFrame = wholeMonth ? '32 days' : '8 days'
  const where = `
  where (c.resolution_time is null and c.last_bet_time > now() - interval '${timeFrame}')
  or c.resolution_time > now() - interval '${timeFrame}'`
  const results = await pg.multi(
    `
    select ${contractColumnsToSelect} from contracts c
    ${where};
    select * from answers a
    where a.contract_id in (
      select id from contracts c
      ${where}
    );
    `,
    []
  )
  const allContracts = results[0].map(convertContract)
  const sumToOneContractIds = allContracts
    .filter((c) => c.mechanism === 'cpmm-multi-1' && c.shouldAnswersSumToOne)
    .map((c) => c.id)
  const answers = results[1].map(convertAnswer)
  log(`Loaded ${allContracts.length} contracts.`)
  log(`Loaded ${answers.length} answers.`)
  const chunks = chunk(allContracts, 1000)
  let i = 0
  for (const contracts of chunks) {
    const contractIds = contracts.map((c) => c.id)
    const now = Date.now()
    const dayAgo = now - DAY_MS
    const weekAgo = now - WEEK_MS
    const monthAgo = now - MONTH_MS

    log('Loading current contract probabilities...')
    const currentContractProbs = await getCurrentProbs(pg, contractIds)
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
    const [dayAgoProbs, weekAgoProbs, monthAgoProbs] = await Promise.all([
      getBetProbsAt(pg, dayAgo, contractIds, sumToOneContractIds),
      getBetProbsAt(pg, weekAgo, contractIds, sumToOneContractIds),
      wholeMonth
        ? getBetProbsAt(pg, monthAgo, contractIds, sumToOneContractIds)
        : Promise.resolve({} as { [key: string]: number }),
    ])

    log('Loading volume...')
    const volumeAndCount = await getVolumeAndCountSince(pg, dayAgo, contractIds)

    log('Loading unfilled limits...')
    const limits = await getUnfilledLimitOrders(pg, contractIds)

    log('Computing metric updates...')

    const contractUpdates: ({ id: string } & Partial<Contract>)[] = []

    const answerUpdates: {
      id: string
      probChanges: {
        day: number
        week: number
        month: number
      }
    }[] = []

    for (const contract of contracts) {
      let cpmmFields: Partial<CPMM> = {}
      if (contract.mechanism === 'cpmm-1') {
        const { id } = contract
        const { poolProb, resProb, resTime } = currentContractProbs[id]
        const prob = resProb ?? poolProb
        const dayAgoProb = dayAgoProbs[id] ?? poolProb
        const weekAgoProb = weekAgoProbs[id] ?? poolProb
        const monthAgoProb =
          (wholeMonth ? monthAgoProbs[id] : contract.probChanges.month) ??
          poolProb
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
          const { poolProb, resProb, resTime } =
            contract.shouldAnswersSumToOne && contract.resolutions
              ? {
                  poolProb: currentAnswerProbs[answer.id].poolProb,
                  resProb: (contract.resolutions[answer.id] ?? 0) / 100,
                  resTime: contract.resolutionTime,
                }
              : currentAnswerProbs[answer.id]
          const prob = resProb ?? poolProb
          const key = contract.id + answer.id
          const dayAgoProb = dayAgoProbs[key] ?? poolProb
          const weekAgoProb = weekAgoProbs[key] ?? poolProb
          const monthAgoProb =
            (wholeMonth ? monthAgoProbs[key] : answer.probChanges.month) ??
            poolProb

          const answerCpmmFields = {
            probChanges: {
              day: resTime && resTime <= dayAgo ? 0 : prob - dayAgoProb,
              week: resTime && resTime <= weekAgo ? 0 : prob - weekAgoProb,
              month: resTime && resTime <= monthAgo ? 0 : prob - monthAgoProb,
            },
          }
          if (hasChanges(answer, answerCpmmFields)) {
            answerUpdates.push({
              id: answer.id,
              probChanges: answerCpmmFields.probChanges,
            })
          }
        }
      }
      const elasticity = computeElasticity(limits[contract.id] ?? [], contract)
      const update: Partial<Contract> = {
        volume24Hours: volumeAndCount[contract.id]?.volume ?? 0,
        uniqueBettorCountDay: volumeAndCount[contract.id]?.countDay ?? 0,
        elasticity,
        ...cpmmFields,
      }

      if (hasChanges(contract, update)) {
        contractUpdates.push({ id: contract.id, ...update })
      }
    }

    await bulkUpdateData(pg, 'contracts', contractUpdates)

    i += contracts.length
    log(`Finished ${i}/${allContracts.length} contracts.`)

    log('Writing answer updates...')
    await bulkUpdateAnswers(pg, answerUpdates)

    log('Done.')
  }
}

const getUnfilledLimitOrders = async (
  pg: SupabaseDirectClient,
  contractIds: string[]
) => {
  const unfilledBets = await pg.manyOrNone(
    `select contract_id, data
    from contract_bets
    where (data->'limitProb')::numeric > 0
    and not contract_bets.is_filled
    and not contract_bets.is_cancelled
    and contract_id = any($1)`,
    [contractIds]
  )
  return mapValues(
    groupBy(unfilledBets, (r) => r.contract_id as string),
    (rows) => rows.map((r) => r.data as LimitBet)
  )
}
const getVolumeAndCountSince = async (
  pg: SupabaseDirectClient,
  since: number,
  contractIds: string[]
) => {
  return Object.fromEntries(
    await pg.map(
      `select contract_id, sum(abs(amount)) as volume,
      count(distinct case when created_time > now() - interval '1 day' and not is_redemption then user_id end)::numeric as count_day
      from contract_bets
      where created_time >= millis_to_ts($1)
      and not is_redemption
      and contract_id = any($2)
       group by contract_id`,
      [since, contractIds],
      (r) => [
        r.contract_id as string,
        {
          volume: parseFloat(r.volume as string),
          countDay: parseFloat(r.count_day as string),
        },
      ]
    )
  )
}

const getCurrentProbs = async (
  pg: SupabaseDirectClient,
  contractIds: string[]
) => {
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
      and id = any($1)
      `,
      [contractIds],
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

// Uses LATERAL LIMIT 1 per (contract, answer) pair for efficient index seeks
// instead of DISTINCT ON which scans all historical bets.
const getBetProbsAt = async (
  pg: SupabaseDirectClient,
  when: number,
  contractIds: string[],
  sumToOneContractIds: string[]
) => {
  if (contractIds.length === 0) return {}

  const sumToOneSet = new Set(sumToOneContractIds)

  // Get answer pairs for multi-answer contracts
  const answerRows = await pg.manyOrNone<{
    contract_id: string
    answer_id: string
  }>(
    'SELECT contract_id, id as answer_id FROM answers WHERE contract_id = ANY($1)',
    [contractIds]
  )

  const multiContractIds = new Set(answerRows.map((r) => r.contract_id))
  const binaryIds = contractIds.filter((id) => !multiContractIds.has(id))
  const nonS2OMultiIds = [
    ...new Set(
      answerRows
        .filter((r) => !sumToOneSet.has(r.contract_id))
        .map((r) => r.contract_id)
    ),
  ]
  const s2OMultiIds = sumToOneContractIds.filter((id) =>
    multiContractIds.has(id)
  )

  const promises: Promise<[string, number][]>[] = []

  // Multi-answer non-sumToOne: NOT is_redemption → uses partial covering index
  if (nonS2OMultiIds.length > 0) {
    promises.push(
      pg.map(
        `SELECT ap.contract_id, ap.answer_id, coalesce(pa.prob, pb.prob) as prob
        FROM (SELECT contract_id, id as answer_id FROM answers WHERE contract_id = ANY($2)) ap
        LEFT JOIN LATERAL (
          SELECT prob_before AS prob FROM contract_bets
          WHERE contract_id = ap.contract_id AND answer_id = ap.answer_id
            AND created_time >= millis_to_ts($1) AND NOT is_redemption
          ORDER BY created_time LIMIT 1
        ) pa ON true
        LEFT JOIN LATERAL (
          SELECT prob_after AS prob FROM contract_bets
          WHERE contract_id = ap.contract_id AND answer_id = ap.answer_id
            AND created_time < millis_to_ts($1) AND NOT is_redemption
          ORDER BY created_time DESC LIMIT 1
        ) pb ON true
        WHERE pa.prob IS NOT NULL OR pb.prob IS NOT NULL`,
        [when, nonS2OMultiIds],
        (r) =>
          [r.contract_id + r.answer_id, parseFloat(r.prob as string)] as [
            string,
            number
          ]
      )
    )
  }

  // Multi-answer sumToOne: includes redemption bets
  if (s2OMultiIds.length > 0) {
    promises.push(
      pg.map(
        `SELECT ap.contract_id, ap.answer_id, coalesce(pa.prob, pb.prob) as prob
        FROM (SELECT contract_id, id as answer_id FROM answers WHERE contract_id = ANY($2)) ap
        LEFT JOIN LATERAL (
          SELECT prob_before AS prob FROM contract_bets
          WHERE contract_id = ap.contract_id AND answer_id = ap.answer_id
            AND created_time >= millis_to_ts($1)
          ORDER BY created_time LIMIT 1
        ) pa ON true
        LEFT JOIN LATERAL (
          SELECT prob_after AS prob FROM contract_bets
          WHERE contract_id = ap.contract_id AND answer_id = ap.answer_id
            AND created_time < millis_to_ts($1)
          ORDER BY created_time DESC LIMIT 1
        ) pb ON true
        WHERE pa.prob IS NOT NULL OR pb.prob IS NOT NULL`,
        [when, s2OMultiIds],
        (r) =>
          [r.contract_id + r.answer_id, parseFloat(r.prob as string)] as [
            string,
            number
          ]
      )
    )
  }

  // Binary contracts: answer_id IS NULL, NOT is_redemption
  if (binaryIds.length > 0) {
    promises.push(
      pg.map(
        `SELECT u.contract_id, coalesce(pa.prob, pb.prob) as prob
        FROM unnest($2::text[]) AS u(contract_id)
        LEFT JOIN LATERAL (
          SELECT prob_before AS prob FROM contract_bets
          WHERE contract_id = u.contract_id AND answer_id IS NULL
            AND created_time >= millis_to_ts($1) AND NOT is_redemption
          ORDER BY created_time LIMIT 1
        ) pa ON true
        LEFT JOIN LATERAL (
          SELECT prob_after AS prob FROM contract_bets
          WHERE contract_id = u.contract_id AND answer_id IS NULL
            AND created_time < millis_to_ts($1) AND NOT is_redemption
          ORDER BY created_time DESC LIMIT 1
        ) pb ON true
        WHERE pa.prob IS NOT NULL OR pb.prob IS NOT NULL`,
        [when, binaryIds],
        (r) =>
          [r.contract_id as string, parseFloat(r.prob as string)] as [
            string,
            number
          ]
      )
    )
  }

  const allResults = await Promise.all(promises)
  return Object.fromEntries(allResults.flat())
}
