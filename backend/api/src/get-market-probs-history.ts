import { groupBy, sortBy, uniq } from 'lodash'
import { getCpmmProbability } from 'common/calculate-cpmm'
import {
  BetProbRow,
  buildMarketProbsHistory,
  MarketProbs,
  MarketProbsHistory,
  PROBS_HISTORY_MAX_FRAMES,
  PROBS_HISTORY_MAX_WINDOW_MS,
  probsHistoryFrameTimes,
} from 'common/market-probs-history'
import { MINUTE_MS } from 'common/util/time'
import { createSingleFlightCache } from 'shared/helpers/single-flight-cache'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIError, APIHandler } from './helpers/endpoint'

// The election map's rewind asks every viewer for the same few keys within a
// step, and on election night one key reads tens of thousands of bets, so
// each process computes a key at most once a minute.
const historyCache = createSingleFlightCache<MarketProbsHistory>({
  ttlMs: MINUTE_MS,
  maxEntries: 100,
})
// Distinct id sets miss the cache and each scan their bets, so a process
// runs only a few at once. The map needs five keys (446 markets).
const MAX_CONCURRENT_COMPUTES = 8
let computing = 0

export const getMarketProbsHistory: APIHandler<'market-probs-history'> = async (
  props
) => {
  const { start, step } = props
  const ids = sortBy(uniq(props.ids))
  const now = Date.now()
  if (start > now) throw new APIError(400, 'start is in the future')
  if (now - start > PROBS_HISTORY_MAX_WINDOW_MS)
    throw new APIError(400, 'start is more than 72 hours ago')
  if (Math.floor((now - start) / step) + 1 > PROBS_HISTORY_MAX_FRAMES)
    throw new APIError(400, `More than ${PROBS_HISTORY_MAX_FRAMES} frames`)

  return await historyCache.get(
    JSON.stringify([start, step, ids]),
    async () => {
      if (computing >= MAX_CONCURRENT_COMPUTES)
        throw new APIError(503, 'Market history is busy, try again shortly')
      computing++
      try {
        return await computeHistory(ids, start, step, now)
      } finally {
        computing--
      }
    }
  )
}

async function computeHistory(
  ids: string[],
  start: number,
  step: number,
  now: number
): Promise<MarketProbsHistory> {
  const pg = createSupabaseDirectClient()
  // Bets through now, not just through the last frame: a series opens at its
  // first bet's probBefore, and sits at its current probability only if it
  // had no bet since `start` at all. Each series' bets are folded per frame
  // in SQL (frame k holds bets after frame k-1, up to and including its
  // time), so a busy market returns one row per frame, not one per bet.
  const [contracts, answers, buckets] = (await pg.multi(
    `select id, mechanism, data->'p' as p, data->'pool' as pool
     from contracts
     where id = any($1);
     select contract_id, id, pool_yes, pool_no, p from answers
     where contract_id = any($1);
     select contract_id as "contractId", answer_id as "answerId",
       ceil(extract(epoch from (created_time - millis_to_ts($2))) * 1000 / $3)::int
         as frame,
       (array_agg(prob_before order by created_time))[1] as "probBefore",
       (array_agg(prob_after order by created_time desc))[1] as "probAfter"
     from contract_bets
     where contract_id = any($1)
       and created_time > millis_to_ts($2)
       and prob_before is not null
       and prob_after is not null
     group by 1, 2, 3;`,
    [ids, start, step]
  )) as [
    {
      id: string
      mechanism: string
      p: number
      pool: { [outcome: string]: number }
    }[],
    {
      contract_id: string
      id: string
      pool_yes: number
      pool_no: number
      p: number
    }[],
    (Omit<BetProbRow, 'createdTime'> & { frame: number })[]
  ]

  // Current probabilities from the pools, the fallback for a series with no
  // bet since `start`. Not answers.prob: resolving sets it to the result, so
  // an answer resolved without a bet since `start` would show its result in
  // every earlier frame.
  const answersByContract = groupBy(answers, (a) => a.contract_id)
  const current: { [contractId: string]: MarketProbs } = Object.fromEntries(
    contracts.map((c) => [
      c.id,
      c.mechanism === 'cpmm-1'
        ? { prob: getCpmmProbability(c.pool, c.p) }
        : {
            answerProbs: Object.fromEntries(
              (answersByContract[c.id] ?? []).map((a) => [
                a.id,
                getCpmmProbability({ YES: a.pool_yes, NO: a.pool_no }, a.p),
              ])
            ),
          },
    ])
  )

  // A frame's bucket acts as one bet placed at the frame's time.
  const bets: BetProbRow[] = buckets.map(({ frame, ...bucket }) => ({
    ...bucket,
    createdTime: start + frame * step,
  }))
  const times = probsHistoryFrameTimes(start, step, now)
  return { times, markets: buildMarketProbsHistory(times, current, bets) }
}
