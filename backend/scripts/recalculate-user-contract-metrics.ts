import { runScript } from './run-script'
import { chunk } from 'lodash'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { updateUserMetricPeriods } from 'shared/update-user-metric-periods'
import { updateUserMetricsWithBets } from 'shared/update-user-metrics-with-bets'
import { updateUserPortfolioHistoriesCore } from 'shared/update-user-portfolio-histories-core'
import { log } from 'shared/utils'

const chunkSize = 10
const MIGRATE_PROFIT_DATA = true
const FIX_PERIODS = false
const UPDATE_PORTFOLIO_HISTORIES = false
const MIGRATE_LOAN_DATA = false
const USING_BETS = false
if (require.main === module) {
  runScript(async ({ pg }) => {
    if (MIGRATE_PROFIT_DATA) {
      await migrateProfitData(pg)
      return
    }
    if (MIGRATE_LOAN_DATA) {
      await migrateLoanData(pg)
      return
    }
    if (FIX_PERIODS) {
      await fixUserPeriods(pg)
      return
    }
    const allUserIds = ['AJwLWoo3xue32XIiAVrL5SyR1WB2'] as string[]
    // const startTime = new Date(0).toISOString()
    //     const allUserIds = await pg.map(
    //       `
    //        select distinct users.id, users.created_time from users
    //        join contract_bets cb on users.id = cb.user_id
    //        where users.created_time > $1
    // --        and cb.created_time > now () - interval '2 week'
    //        order by users.created_time
    //                 `,
    //       [startTime],
    //       (row) => [row.id, row.created_time]
    //     )
    if (USING_BETS) {
      await recalculateUsingBets(allUserIds)
      return
    }

    if (UPDATE_PORTFOLIO_HISTORIES) {
      await updateUserPortfolioHistoriesCore(allUserIds)
    }
  })
}

const recalculateUsingBets = async (allUserIds: string[]) => {
  console.log('Total users:', allUserIds.length)
  const chunks = chunk(allUserIds, chunkSize)
  let total = 0
  for (const userIds of chunks) {
    // TODO: before using this, make sure to fix the deprecation warning
    await updateUserMetricsWithBets(userIds)
    total += userIds.length
    console.log(`Updated ${userIds.length} users, total ${total} users updated`)
    console.log('last created time:', userIds[userIds.length - 1])
  }
}

const fixUserPeriods = async (pg: SupabaseDirectClient) => {
  // const allUserIds = [['AJwLWoo3xue32XIiAVrL5SyR1WB2', 0]] as [string, number][]
  const allUserIds = await pg.map(
    `
      select distinct ucm.user_id from user_contract_metrics ucm
      join contracts on ucm.contract_id = contracts.id
      where resolution_time < now() - interval '7 day'
      and (((ucm.data->'from'->'week'->'profit')::numeric) > 0.01 or
          ((ucm.data->'from'->'week'->'profit')::numeric) <-0.01);
      `,
    [],
    (row) => [row.user_id, '']
  )
  console.log('Total users:', allUserIds.length)
  const chunks = chunk(allUserIds, chunkSize)
  let total = 0
  for (const userIds of chunks) {
    await updateUserMetricPeriods(userIds.map((u) => u[0]))
    total += userIds.length
    console.log(`Updated ${userIds.length} users, total ${total} users updated`)
    console.log('last created time:', userIds[userIds.length - 1][1])
  }
}

// Migrate loan data from data jsonb to native column
export async function migrateLoanData(
  pg: SupabaseDirectClient,
  chunkSize = 200
) {
  log('Getting all users with contract metrics...')
  const userIds = await pg.map(
    `select distinct user_id from user_contract_metrics`,
    [],
    (r) => r.user_id as string
  )

  log(`Found ${userIds.length} users with metrics`)
  const chunks = chunk(userIds, chunkSize)

  for (const userChunk of chunks) {
    await pg.none(
      `
      update user_contract_metrics 
      set loan = coalesce((data->>'loan')::numeric, 0)
      where user_id = any($1)
    `,
      [userChunk]
    )

    log(`Updated loan data for ${userChunk.length} users`)
  }

  log('Finished migrating loan data')
}

// Migrate profit data from data jsonb to native column
export async function migrateProfitData(
  pg: SupabaseDirectClient,
  chunkSize = 200
) {
  log('Getting all users with contract metrics...')
  const userIds = await pg.map(
    `select distinct user_id from user_contract_metrics`,
    [],
    (r) => r.user_id as string
  )

  log(`Found ${userIds.length} users with metrics`)
  const chunks = chunk(userIds, chunkSize)

  for (const userChunk of chunks) {
    await pg.none(
      `
      update user_contract_metrics 
      set profit = coalesce((data->>'profit')::numeric, 0)
      where user_id = any($1)
    `,
      [userChunk]
    )

    log(`Updated profit data for ${userChunk.length} users`)
  }

  log('Finished migrating profit data')
}
