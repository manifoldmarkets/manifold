import { runScript } from './run-script'
import { chunk } from 'lodash'
import { log } from 'shared/utils'
import { updateUserMetricsCore } from 'shared/update-user-metrics-core'
const PROFIT_CUTOFF_TIME = 1715805887741
const UNRANK_AND_ZERO_PROFITS_ONLY = true
if (require.main === module) {
  runScript(async ({ pg, firestore }) => {
    const userIdsToZero = await pg.map(
      `select distinct users.id
      from users
      join contract_bets cb on cb.user_id = users.id
      join contracts on cb.contract_id = contracts.id
        where 
            (coalesce((contracts.data -> 'isRanked')::boolean, true) = false or
             contracts.visibility!='public')
        and contracts.resolution_time is not null
        and contracts.resolution_time <= millis_to_ts($1)
        and contracts.deleted = false
      `,
      [PROFIT_CUTOFF_TIME],
      (row) => row.id
    )
    log(`Found ${userIdsToZero.length} users to update`)
    const chunksToZero = chunk(userIdsToZero, 500)
    let totalProcessed = 0
    for (const chunk of chunksToZero) {
      await Promise.all(
        chunk.map(async (userId) => {
          await pg.none(
            `
                with filtered_metrics as (
                    select ucm.profit, ucm.id as ucm_id
                    from user_contract_metrics ucm
                    join contracts on contracts.id = ucm.contract_id
                    where ucm.user_id = $1
                      and contracts.resolution_time is not null
                      and contracts.resolution_time <= millis_to_ts($2)
                      and contracts.deleted = false
                      and ucm.answer_id is null
                      and (coalesce((contracts.data -> 'isRanked')::boolean, true) = false or
                            contracts.visibility!='public')
                )
                update user_contract_metrics
                set profit_adjustment = null
                from filtered_metrics
                where user_contract_metrics.id = filtered_metrics.ucm_id;
            `,
            [userId, PROFIT_CUTOFF_TIME]
          )
          await pg.none(
            `update users
             set profit_adjustment = (
                 select sum(ucm.profit_adjustment)
                 from user_contract_metrics ucm
                 where ucm.user_id = users.id
             )
             where id = $1`,
            [userId]
          )
        })
      )
      totalProcessed += chunk.length
      log(
        `Updated ${chunk.length} users, total ${totalProcessed} users updated`
      )
    }

    if (UNRANK_AND_ZERO_PROFITS_ONLY) {
      return
    }

    log('Computing non-zero profit adjustment for users')
    // Compute dpm-converts only
    const userIdsToUpdate = await pg.map(
      `select distinct users.id
      from users
      join contract_bets cb on cb.user_id = users.id
      join contracts c on cb.contract_id = c.id
      where c.mechanism = 'cpmm-multi-1' and c.created_time < '2023-08-01 18:06:58.813000 +00:00'::timestamptz
      `,
      [],
      (row) => row.id
    )
    let i = 0
    while (i < userIdsToUpdate.length / 1000) {
      await updateUserMetricsCore(
        userIdsToUpdate.slice(i * 1000, (i + 1) * 1000)
      )
      i++
      console.log(`Updated ${i} times`)
    }
    // Compute all profit adjustments
    // const userIds = await pg.map(
    //   `
    //               select id from users where
    //     (data->'profitCached'->'allTime')::numeric !=0 and
    //     not coalesce((data->'isBannedFromPosting')::boolean,false) = true
    //     `,
    //   [],
    //   (row) => row.id
    // )
    const chunks = chunk(userIdsToUpdate, 500)
    let total = 0
    for (const chunk of chunks) {
      await Promise.all(
        chunk.map(async (userId) => {
          await pg.none(
            `
                with filtered_metrics as (
                    select ucm.profit, ucm.id as ucm_id
                    from user_contract_metrics ucm
                    join contracts on contracts.id = ucm.contract_id
                    where ucm.user_id = $1
                      and contracts.resolution_time is not null
                      and contracts.resolution_time <= millis_to_ts($2)
                      and contracts.deleted = false
                      and ucm.answer_id is null
                      and (ucm.profit != 0 or ucm.profit_adjustment is not null) 
                      and coalesce((contracts.data -> 'isRanked')::boolean, true) = true
                )
                update user_contract_metrics
                set profit_adjustment = filtered_metrics.profit * 9
                from filtered_metrics
                where user_contract_metrics.id = filtered_metrics.ucm_id;
            `,
            [userId, PROFIT_CUTOFF_TIME]
          )
          await pg.none(
            `update users
             set profit_adjustment = (
                 select sum(ucm.profit_adjustment)
                 from user_contract_metrics ucm
                 where ucm.user_id = users.id
             )
             where id = $1`,
            [userId]
          )
        })
      )
      total += chunk.length
      log(`Updated ${chunk.length} users, total ${total} users updated`)
    }
  })
}
