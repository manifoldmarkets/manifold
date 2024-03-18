import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'

export async function calculateConversionScore() {
  const pg = createSupabaseDirectClient()
  log('Loading contract data...')
  let offset = 0
  let contractIds = await pg.map(
    `select id from contracts limit 1000 offset $1`,
    [offset],
    (c) => c.id
  )
  while (contractIds.length > 0) {
    log(`Updating conversions for ${contractIds.length} contracts...`)
    await pg
      .none(
        `
    with total_viewers as (
      select contract_id, count(distinct user_id) as views
      from user_contract_views
      where user_id is not null
      group by contract_id
    ),
     total_bettors as (
       select contract_id, count(distinct user_id) as unique_bettors
       from contract_bets
       group by contract_id
     )
    update contracts c
    set conversion_score =
            coalesce(tb.unique_bettors, 0)::numeric /
            coalesce(coalesce(tv.views, tb.unique_bettors), 1)::numeric
    from total_viewers tv
    left join total_bettors tb on tv.contract_id = tb.contract_id
    where c.id = tv.contract_id
    and c.id = any($1)
    `,
        [contractIds]
      )
      .catch((e) => {
        log('Error:', e)
        return null
      })
    log(`Finished processing ${offset + contractIds.length} contracts.`)

    offset += contractIds.length
    contractIds = await pg.map(
      `select id from contracts limit 1000 offset $1`,
      [offset],
      (c) => c.id
    )
  }
  await pg.none(``)
  log('Done.')
}
