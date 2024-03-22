import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'
import {
  DEFAULT_CONVERSION_SCORE_DENOMINATOR,
  DEFAULT_CONVERSION_SCORE_NUMERATOR,
} from 'common/new-contract'

export async function calculateConversionScore() {
  const pg = createSupabaseDirectClient()
  log('Loading contract data...')
  let offset = 0
  const contractsQuery = `select id from contracts
      where resolution_time is null
      and close_time > now()
      and visibility = 'public'
      limit 1000 offset $1`
  let contractIds = await pg.map(contractsQuery, [offset], (c) => c.id)
  while (contractIds.length > 0) {
    log(`Updating conversions for ${contractIds.length} contracts...`)
    await pg
      .none(
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
           where name in ('page bet', 'page comment', 'page repost', 'page like')
           and contract_id= any ($1)
           group by contract_id
         ),
         card_enjoyers as (
           select contract_id, count(distinct user_id) as uniques
           from user_contract_interactions
           where name in ('card bet', 'card like', 'card click')
           and contract_id= any ($1)
           group by contract_id
         )
        update contracts c
        set conversion_score = (
          select power(
             (($2+coalesce(ce.uniques, 0) * 1.0) / (coalesce(nullif(cv.uniques,0),ce.uniques,0)+$3))
                 *
             (($2+coalesce(pe.uniques, 0) * 1.0) / (coalesce(nullif(pv.uniques,0), pe.uniques,0)+$3)),
             1.0 / 2
           )
          from contracts c2
             left join card_viewers cv on c2.id = cv.contract_id
             left join card_enjoyers ce on c2.id = ce.contract_id
             left join page_viewers pv on c2.id = pv.contract_id
             left join page_enjoyers pe on c2.id = pe.contract_id
          where c2.id = c.id
        )
        where c.id = any ($1)
        `,
        [
          contractIds,
          DEFAULT_CONVERSION_SCORE_NUMERATOR,
          DEFAULT_CONVERSION_SCORE_DENOMINATOR,
        ]
      )
      .catch((e) => {
        log('Error on set conversion scores', e)
        return null
      })
    log(`Finished processing ${offset + contractIds.length} contracts.`)

    offset += contractIds.length
    contractIds = await pg.map(contractsQuery, [offset], (c) => c.id)
  }
  log('Done.')
}
