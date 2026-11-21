import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'
import {
  DEFAULT_CONVERSION_SCORE_DENOMINATOR,
  DEFAULT_CONVERSION_SCORE_NUMERATOR,
} from 'common/new-contract'
import { chunk, uniq } from 'lodash'

// The aggregates below are the expensive part — count(distinct user_id) over
// user_contract_views, user_contract_interactions and user_view_events for a
// whole chunk of contracts. Measured on prod, one 100-contract chunk takes
// 8-160 seconds.
//
// It used to be a single `update contracts set conversion_score = (<those
// aggregates>)`, which meant every contract in the chunk held a ROW LOCK for
// that entire duration. That is fine for a market whose row is only written
// when someone bets on it, and not at all fine for a perp: the oracle tick
// writes the BTC perp's row every 2 seconds and bounds its lock wait to 1s
// (FAST_TICK_ORACLE_BOUNDS), so every tick inside the chunk's statement lost
// its slot to a 55P03. That was 86% of all oracle-tick apply failures — a
// 40-70 second freeze of the executable mark, once an hour, at :46.
//
// Computing first and writing second keeps the semantics identical and holds
// the row lock for the length of a keyed update instead of the length of the
// aggregation.
//
// The write takes its row locks in id order and skips rows someone else holds
// (score-contracts pre-locks in id order for the same reason — an unordered
// batch write deadlocked against other multi-row contracts writers). Skipping
// means the write never waits, so it can neither deadlock nor sit on a lock it
// already holds — a perp's included — while a bet or oracle tick finishes on
// another row.
//
// A skipped contract cannot simply be left for "the next run": the candidate
// query below only sees contracts VIEWED IN THE LAST HOUR, so one that is
// locked now and gets no further views would never be reconsidered and its
// score would freeze indefinitely. Skipped ids are therefore carried forward
// in `pendingRescoreIds` and unioned into the next run's candidates,
// independently of that rolling activity window.

// Ids whose write we intended but did not land, carried between runs. The
// scheduler is long-lived, so this survives from one hourly firing to the
// next; a process restart drops it, after which a contract is rescored the
// next time it is viewed — the same exposure the job had before this change,
// and this is a discovery ranking, not money.
let pendingRescoreIds: string[] = []

// Bounds the carry-forward if something keeps a row locked indefinitely.
// Ids are ~12 chars, so this is tens of KB at worst.
const MAX_PENDING_RESCORE_IDS = 10_000

type RowMapper<T> = (row: Record<string, any>) => T

// The slice of the pg client this job uses, so the retry behaviour below can
// be tested without a live database (the repo has no DB test harness).
export type ConversionScoreDb = {
  map<T>(query: string, values: unknown[], cb: RowMapper<T>): Promise<T[]>
  manyOrNone<T>(query: string, values: unknown[]): Promise<T[]>
  tx<T>(cb: (tx: ConversionScoreTx) => Promise<T>): Promise<T>
}
export type ConversionScoreTx = {
  map<T>(query: string, values: unknown[], cb: RowMapper<T>): Promise<T[]>
  none(query: string, values: unknown[]): Promise<null>
}

export async function calculateConversionScore() {
  pendingRescoreIds = await rescoreConversionScores(
    createSupabaseDirectClient(),
    pendingRescoreIds
  )
}

// Returns the ids that still need writing, for the next run to retry.
export async function rescoreConversionScores(
  pg: ConversionScoreDb,
  carriedOverIds: string[] = []
): Promise<string[]> {
  log('Loading contract data...')
  const viewedIds = await pg.map(
    `select distinct contract_id from user_view_events
        where created_time > now() - interval '1 hour'`,
    [],
    (c) => c.contract_id as string
  )
  // Retries first: a contract that has been waiting since an earlier run is
  // the one at risk of never being rescored at all.
  const contractIds = uniq([...carriedOverIds, ...viewedIds])
  if (carriedOverIds.length > 0)
    log(
      `Retrying ${carriedOverIds.length} contracts skipped by an earlier run.`
    )
  const chunks = chunk(contractIds, 100)
  log(
    `Processing conversion scores for ${contractIds.length} contracts in ${chunks.length} chunks...`
  )
  let processed = 0
  const stillPending: string[] = []
  for (const chunk of chunks) {
    const scores = await pg
      .manyOrNone<{ id: string; score: string }>(
        `
        with card_viewers as (
          select contract_id, coalesce(count(distinct user_id), 0) as uniques
          from user_contract_views
          where card_views > 0
            and contract_id= any ($1)
          group by contract_id
        ),
         page_viewers as (
           select contract_id, coalesce(count(distinct user_id), 0) as uniques
           from user_contract_views
           where page_views > 0
             and contract_id= any ($1)
           group by contract_id
         ),
         page_enjoyers as (
           select contract_id, count(distinct user_id) as uniques
           from user_contract_interactions
           where name in ('page bet', 'page comment', 'page repost', 'page like', 'page share')
             and contract_id= any ($1)
           group by contract_id
         ),
         card_enjoyers as (
           select contract_id, count(distinct user_id) as uniques
           from user_contract_interactions
           where name in ('card bet', 'card like', 'card click')
             and contract_id= any ($1)
           group by contract_id
         ),
         recent_card_viewers as (
           select contract_id, count(distinct user_id) as uniques
           from user_view_events
           where name = 'card'
             and contract_id= any ($1)
             and created_time > now() - interval '1 week'
           group by contract_id
         ),
         recent_page_viewers as (
           select contract_id, count(distinct user_id) as uniques
           from user_view_events
           where name = 'page'
             and contract_id= any ($1)
             and created_time > now() - interval '1 week'
           group by contract_id
         ),
         recent_card_enjoyers as (
           select contract_id, count(distinct user_id) as uniques
           from user_contract_interactions
           where name in ('card bet', 'card like', 'card click')
             and contract_id= any ($1)
             and created_time > now() - interval '1 week'
           group by contract_id),
         recent_page_enjoyers as (
           select contract_id, count(distinct user_id) as uniques
           from user_contract_interactions
           where name in ('page bet', 'page comment', 'page repost', 'page like', 'page share')
             and contract_id= any ($1)
             and created_time > now() - interval '1 week'
           group by contract_id)
        select c.id,
          case when
              -- If our data is sus, return default conversion score
            (coalesce(pe.uniques,0) > coalesce(pv.uniques,0) or
            coalesce(ce.uniques,0) > coalesce(cv.uniques,0))
            then ($2 * 1.0) / $3
          else
            power(
              (($2+coalesce(rce.uniques, 0) * 1.0) / (coalesce(nullif(rcv.uniques,0),rce.uniques,0)+$3))
                  *
              (($2+coalesce(rpe.uniques, 0) * 1.0) / (coalesce(nullif(rpv.uniques,0),rpe.uniques,0)+$3))
                  *
              (($2+coalesce(ce.uniques, 0) * 1.0) / (coalesce(nullif(cv.uniques,0),ce.uniques,0)+$3))
                  *
              (($2+coalesce(pe.uniques, 0) * 1.0) / (coalesce(nullif(pv.uniques,0), pe.uniques,0)+$3)),
              1.0 / 4
            ) end::text as score
        from contracts c
           left join recent_card_enjoyers rce on c.id = rce.contract_id
           left join recent_card_viewers rcv on c.id = rcv.contract_id
           left join recent_page_enjoyers rpe on c.id = rpe.contract_id
           left join recent_page_viewers rpv on c.id = rpv.contract_id
           left join card_viewers cv on c.id = cv.contract_id
           left join card_enjoyers ce on c.id = ce.contract_id
           left join page_viewers pv on c.id = pv.contract_id
           left join page_enjoyers pe on c.id = pe.contract_id
        where c.id = any ($1)
        `,
        [
          chunk,
          DEFAULT_CONVERSION_SCORE_NUMERATOR,
          DEFAULT_CONVERSION_SCORE_DENOMINATOR,
        ]
      )
      .catch((e) => {
        log('Error on compute conversion scores', e)
        return null
      })

    // A failed compute is the same defect class as a skipped write — a
    // rescore we intended and did not do — so the chunk is retried too
    // rather than waiting on the contracts happening to be viewed again.
    if (scores === null) stillPending.push(...chunk)

    // The score travels as text: conversion_score is an unconstrained numeric,
    // and the default numeric parser (parseFloat) would round the server-side
    // value through a double on the way back. Number() is only used to check
    // it — a non-finite score would blank a column the feed ranks on. The
    // expression above coalesces every input, so this only ever drops a row
    // that a future edit broke, and dropping it leaves the previous score.
    const writable = (scores ?? []).filter((row) =>
      Number.isFinite(Number(row.score))
    )
    if (writable.length > 0) {
      const writtenIds = await pg
        .tx(async (tx) => {
          const lockedIds = new Set(
            await tx.map(
              `select id from contracts
               where id = any ($1)
               order by id
               for update skip locked`,
              [writable.map((row) => row.id)],
              (row) => row.id as string
            )
          )
          const rows = writable.filter((row) => lockedIds.has(row.id))
          if (rows.length > 0)
            await tx.none(
              `update contracts c
               set conversion_score = v.score
               from (select unnest($1::text[]) as id, unnest($2::numeric[]) as score) v
               where c.id = v.id`,
              [rows.map((row) => row.id), rows.map((row) => row.score)]
            )
          return rows.map((row) => row.id)
        })
        .catch((e) => {
          log('Error on set conversion scores', e)
          return [] as string[]
        })
      const written = new Set(writtenIds)
      const skipped = writable
        .map((row) => row.id)
        .filter((id) => !written.has(id))
      if (skipped.length > 0) {
        stillPending.push(...skipped)
        log(
          `Skipped ${skipped.length} contracts whose rows were locked; they keep their previous score and are retried next run.`
        )
      }
    }

    processed += chunk.length
    log(`Finished processing conversion scores for ${processed} contracts.`)
  }

  // Newest retries win if something is persistently locked, so a permanently
  // stuck id cannot crowd out fresher ones forever.
  const pending = uniq(stillPending).slice(-MAX_PENDING_RESCORE_IDS)
  if (pending.length > 0)
    log(`Carrying ${pending.length} contracts forward to the next run.`)
  log('Done.')
  return pending
}
