import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'
import {
  DEFAULT_CONVERSION_SCORE_DENOMINATOR,
  DEFAULT_CONVERSION_SCORE_NUMERATOR,
} from 'common/new-contract'
import { chunk } from 'lodash'

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
export async function calculateConversionScore() {
  const pg = createSupabaseDirectClient()
  log('Loading contract data...')
  const contractIds = await pg.map(
    `select distinct contract_id from user_view_events
        where created_time > now() - interval '1 hour'`,
    [],
    (c) => c.contract_id
  )
  const chunks = chunk(contractIds, 100)
  log(
    `Processing conversion scores for ${contractIds.length} contracts in ${chunks.length} chunks...`
  )
  let processed = 0
  for (const chunk of chunks) {
    const scores = await pg
      .manyOrNone<{ id: string; score: number | string }>(
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
            ) end as score
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

    // A null score would blank a column the feed ranks on. The expression
    // above coalesces every input, so this only ever drops a row that a future
    // edit broke — and dropping it leaves the previous score in place.
    const writable = (scores ?? []).filter((row) =>
      Number.isFinite(Number(row.score))
    )
    if (writable.length > 0)
      await pg
        .none(
          `update contracts c
           set conversion_score = v.score
           from (select unnest($1::text[]) as id, unnest($2::numeric[]) as score) v
           where c.id = v.id`,
          [writable.map((row) => row.id), writable.map((row) => row.score)]
        )
        .catch((e) => {
          log('Error on set conversion scores', e)
          return null
        })

    processed += chunk.length
    log(`Finished processing conversion scores for ${processed} contracts.`)
  }
  log('Done.')
}
