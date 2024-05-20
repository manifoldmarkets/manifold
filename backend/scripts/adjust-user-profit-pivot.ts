import { runScript } from './run-script'
import { chunk } from 'lodash'
import { log } from 'shared/utils'
import { DPM_CUTOFF_TIMESTAMP, PROFIT_CUTOFF_TIME } from 'common/contract'

const UNRANK_AND_ZERO_PROFITS = true
const ONLY_UNRANK_AND_ZERO_PROFITS = true

if (require.main === module) {
  runScript(async ({ pg }) => {
    const chunkSize = 100
    if (UNRANK_AND_ZERO_PROFITS) {
      const userIdsToZero = await pg.map(
        `select distinct users.id
         from users
          join contract_bets cb on cb.user_id = users.id
          join contracts on cb.contract_id = contracts.id
         where (
             -- unranked
             coalesce((contracts.data -> 'isRanked')::boolean, true) = false or
             -- or unlisted
             contracts.visibility != 'public'
             -- or formerly dpm
--              or (contracts.mechanism = 'cpmm-multi-1' and contracts.created_time < $2::timestamptz)
             )
           and contracts.resolution_time is not null
--            and contracts.resolution_time <= millis_to_ts($1)
        `,
        [PROFIT_CUTOFF_TIME, DPM_CUTOFF_TIMESTAMP],
        (row) => row.id
      )
      log(`Found ${userIdsToZero.length} users to update`)
      const chunksToZero = chunk(userIdsToZero, chunkSize)
      let totalProcessed = 0
      for (const chunk of chunksToZero) {
        await Promise.all(
          chunk.map(async (userId) => {
            await pg.none(
              `
                  with filtered_metrics as (select ucm.id as ucm_id
                    from user_contract_metrics ucm
                    join contracts on contracts.id = ucm.contract_id
                      where ucm.user_id = $1
                      and ucm.answer_id is null
                      and (
                        -- unranked    
                       coalesce((contracts.data -> 'isRanked')::boolean, true) = false or
                       -- or unlisted
                       contracts.visibility != 'public'
--                        formerly dpm get set to null
--                        or (contracts.mechanism = 'cpmm-multi-1' and contracts.created_time < $3::timestamptz)
                       )
                     and contracts.resolution_time is not null
--                      and contracts.resolution_time <= millis_to_ts($2)
                    )
                  update user_contract_metrics
                  set profit_adjustment = -profit
                  from filtered_metrics
                  where user_contract_metrics.id = filtered_metrics.ucm_id;
              `,
              [userId, PROFIT_CUTOFF_TIME, DPM_CUTOFF_TIMESTAMP]
            )
            await pg.none(
              `update users
               set resolved_profit_adjustment = (select sum(ucm.profit_adjustment)
                                        from user_contract_metrics ucm
                                        where ucm.user_id = users.id)
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
      if (ONLY_UNRANK_AND_ZERO_PROFITS)
        return log('Only unranked and zero profit users updated')
    }

    log('Computing non-zero profit adjustment for users')

    // Recalculate dpm-convert contract metrics
    // const userIdsToUpdate = await pg.map(
    //   `select distinct users.id
    //   from users
    //   join contract_bets cb on cb.user_id = users.id
    //   join contracts c on cb.contract_id = c.id
    //   where
    //      c.mechanism = 'cpmm-multi-1' and c.created_time < $2::timestamptz
    //     and c.resolution_time is not null
    //     and c.resolution_time <= millis_to_ts($1)
    //     and c.deleted = false
    //   `,
    //   [PROFIT_CUTOFF_TIME, DPM_CUTOFF_TIMESTAMP],
    //   (row) => row.id
    // )
    // let i = 0
    // while (i < userIdsToUpdate.length / chunkSize) {
    //   await updateUserMetricsCore(
    //     userIdsToUpdate.slice(i * chunkSize, (i + 1) * chunkSize)
    //   )
    //   i++
    //   console.log(`Updated ${i} times`)
    // }

    // Calculate all profit adjustments
    const userIdsToUpdate = await pg.map(
      `
        select id from users where
        data->>'lastBetTime' is not null
        `,
      [],
      (row) => row.id
    )
    const chunks = chunk(userIdsToUpdate, chunkSize)
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
                      and contracts.visibility = 'public'
                      and (contracts.mechanism != 'cpmm-multi-1' or contracts.created_time > $3::timestamptz)
                )
                update user_contract_metrics
                set profit_adjustment = filtered_metrics.profit * 9
                from filtered_metrics
                where user_contract_metrics.id = filtered_metrics.ucm_id;
            `,
            [userId, PROFIT_CUTOFF_TIME, DPM_CUTOFF_TIMESTAMP]
          )
          await pg.none(
            `update users
             set resolved_profit_adjustment = (
                 case
                 when users.data->>'isBannedFromPosting' = 'true' then 0
                 else (
                     select sum(ucm.profit_adjustment)
                     from user_contract_metrics ucm
                     where ucm.user_id = users.id
                 )
                 end
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
