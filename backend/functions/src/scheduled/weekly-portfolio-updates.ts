import * as functions from 'firebase-functions'
import { sum } from 'lodash'
import { getUsersContractMetricsOrderedByProfit } from 'common/supabase/contract-metrics'
import { createWeeklyPortfolioUpdateNotification } from 'shared/create-notification'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { log } from 'shared/utils'
import { secrets } from 'common/secrets'
import { bulkInsert } from 'shared/supabase/utils'
import * as dayjs from 'dayjs'
import { Row } from 'common/supabase/utils'
import { ContractMetric } from 'common/contract-metric'

const now = new Date()

const getDate = () => dayjs(now).format('YYYY-MM-DD')

const USERS_TO_SAVE = 300
// Saving metrics should work until our users are greater than USERS_TO_SAVE * 2*60 users
export const saveWeeklyContractMetrics = functions
  .runWith({ secrets, timeoutSeconds: 60 })
  // every minute for 2 hours Friday 4am PT (UTC -08:00)
  .pubsub.schedule('* 13-14 * * 5')
  .timeZone('Etc/UTC')
  .onRun(async () => {
    await saveWeeklyContractMetricsInternal()
  })

export const sendWeeklyPortfolioUpdate = functions
  .runWith({ secrets, timeoutSeconds: 540 })
  // every Friday at 12pm PT (UTC -08:00)
  .pubsub.schedule('0 20 * * 5')
  .timeZone('Etc/UTC')
  .onRun(async () => {
    await sendWeeklyPortfolioUpdateNotifications()
  })

export const saveWeeklyContractMetricsInternal = async () => {
  const pg = createSupabaseDirectClient()
  const db = createSupabaseClient()

  // users who have disabled browser notifications for profit/loss updates won't be able to see their portfolio updates in the past
  const userIds = await pg.map<string>(
    `select p.id from private_users p
    where p.data->'notificationPreferences'->'profit_loss_updates' ? 'browser'
    and not exists (
      select 1 from weekly_update w where w.user_id = p.id and w.range_end = $1
    )
    limit $2`,
    [getDate(), USERS_TO_SAVE],
    (data) => data.id
  )

  log('usersToSave', userIds.length)
  if (userIds.length === 0) return

  // TODO: try out the new rpc call
  const usersToContractMetrics = await getUsersContractMetricsOrderedByProfit(
    userIds,
    db,
    'week'
  )
  if (Object.keys(usersToContractMetrics).length === 0) {
    log('Error: no contract metrics to save')
    return
  }

  const userProfits = await pg.manyOrNone<{
    id: string
    profit: number | undefined
  }>(
    `select id, (data->'profitCached'->'weekly')::numeric as profit
    from users
    where id = any($1)`,
    [userIds]
  )

  const results = userIds.map((id) => {
    const profit = userProfits.find((u) => u.id === id)?.profit
    const contractMetrics = usersToContractMetrics[id]
    return {
      contract_metrics: contractMetrics,
      user_id: id,
      profit:
        profit ?? sum(contractMetrics.map((m) => m.from?.week.profit ?? 0)),
      range_end: getDate(),
    }
  })

  await bulkInsert(pg, 'weekly_update', results)

  log('saved weekly contract metrics for users:', userIds.length)
}

export const sendWeeklyPortfolioUpdateNotifications = async () => {
  const pg = createSupabaseDirectClient()

  const now = getDate()

  const data = await pg.manyOrNone<
    Pick<Row<'private_users'>, 'id'> &
      Pick<Row<'weekly_update'>, 'profit' | 'range_end' | 'contract_metrics'> &
      Pick<Row<'users'>, 'username'>
  >(
    `select p.id, w.profit, w.range_end, w.contract_metrics, u.username
    from private_users p join weekly_update w on w.user_id = p.id join users u on u.id = p.id
    where p.data->'notificationPreferences'->'profit_loss_updates' ? 'browser'
    and w.range_end = $1`,
    [now]
  )

  log('users to send weekly portfolio updates to', data.length)

  await Promise.all(
    data.map(async ({ id, profit, range_end, contract_metrics, username }) => {
      const contractMetrics = contract_metrics as ContractMetric[]
      if (contractMetrics.length === 0) return

      await createWeeklyPortfolioUpdateNotification(
        id,
        username,
        profit,
        range_end
      )
    })
  )
}
