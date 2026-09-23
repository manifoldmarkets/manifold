import { PerpContract } from 'common/contract'
import { Notification } from 'common/notification'
import {
  canSendPerpPnlAlert,
  evaluatePerpPositionAlert,
  PERP_ALERT_REASONS,
  PerpAlert,
  PerpUserAlertState,
  recentPerpPnlAlertTimes,
} from 'common/perps/alerts'
import { getPerpOracleFreshness } from 'common/perps/oracle'
import { formatOraclePrice } from 'common/perps/oracle-display'
import { inferPriceDecimals } from 'common/perps/format'
import { PerpPosition } from 'common/perps/position'
import { getUserFacingPnl } from 'common/perps/pnl'
import { Row } from 'common/supabase/utils'
import { convertPrivateUser } from 'common/supabase/users'
import { MANIFOLD_AVATAR_URL } from 'common/user'
import { getNotificationDestinationsForUser } from 'common/user-notification-preferences'
import { formatMoneyPrecise } from 'common/util/format'
import { nanoid } from 'common/util/random'
import { mapAsync } from 'common/util/promise'
import { createPushNotifications } from 'shared/create-push-notifications'
import { rowToPosition } from 'shared/perps/queries'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { log } from 'shared/utils'
import { broadcast } from 'shared/websockets/server'

export const makePerpPositionAlertNotification = (
  contract: PerpContract,
  position: PerpPosition,
  alert: PerpAlert,
  now: number
): Notification => {
  const price = contract.oraclePrice
  const decimals = inferPriceDecimals([price, position.liquidationPrice])
  const formatPrice = (p: number) =>
    formatOraclePrice(contract.oracleFeedId, p, decimals)
  const pnl = getUserFacingPnl(position, price)
  const distancePercent =
    (Math.abs(price - position.liquidationPrice) / price) * 100
  const sourceText =
    alert.reason === 'perp_liquidation_warning'
      ? `Your ${position.direction} position on ${contract.question} is ${
          alert.threshold === 10 ? 'very ' : ''
        }close to liquidation. The oracle price is ${formatPrice(price)}, ${
          distancePercent < 0.1 ? 'less than 0.1' : distancePercent.toFixed(1)
        }% from your liquidation price of ${formatPrice(
          position.liquidationPrice
        )}. Review your position.`
      : `Your ${position.direction} position on ${contract.question} is ${
          alert.reason === 'perp_profit' ? 'up' : 'down'
        } ${Math.abs(alert.pnlPercent)
          .toFixed(1)
          .replace(/\.0$/, '')}% (${formatMoneyPrecise(
          pnl
        )} unrealized P&L, including funding and opening fees).`
  return {
    id: `perp-alert-${nanoid(12)}`,
    userId: position.userId,
    reason: alert.reason,
    createdTime: now,
    isSeen: false,
    sourceId: contract.id,
    sourceType: 'contract',
    sourceUpdateType: 'updated',
    sourceContractId: contract.id,
    sourceContractTitle: contract.question,
    sourceContractSlug: contract.slug,
    sourceContractCreatorUsername: contract.creatorUsername,
    sourceUserName: contract.creatorName,
    sourceUserUsername: contract.creatorUsername,
    sourceUserAvatarUrl: contract.creatorAvatarUrl ?? MANIFOLD_AVATAR_URL,
    sourceSlug: contract.slug,
    sourceTitle: contract.question,
    sourceText,
    data: {
      ...alert,
      direction: position.direction,
      openedTime: position.openedTime,
      oraclePrice: price,
      liquidationPrice: position.liquidationPrice,
    },
  }
}

export const sendPerpPositionAlerts = async () => {
  const pg = createSupabaseDirectClient()
  const users = await pg.manyOrNone<{ user_id: string }>(
    `select distinct user_id from contract_perp_positions where size > 0`
  )
  await mapAsync(
    users,
    async ({ user_id }) => {
      try {
        await sendPerpPositionAlertsForUser(pg, user_id)
      } catch (error) {
        log.error('Failed to evaluate perp position alerts', {
          userId: user_id,
          error,
        })
      }
    },
    5
  )
}

export const sendPerpPositionAlertsForUser = async (
  pg: SupabaseDirectClient,
  userId: string
) => {
  const delivery = await pg.tx(async (tx) => {
    // Serializes duplicate scheduler instances and the per-user PnL cap.
    // Separate namespace from trading locks; never holds up the price tick.
    await tx.one(`select pg_advisory_xact_lock(1936027745, hashtext($1))`, [
      userId,
    ])
    const privateUserRow = await tx.oneOrNone<Row<'private_users'>>(
      `select * from private_users where id = $1`,
      [userId]
    )
    if (!privateUserRow) return undefined
    const privateUser = convertPrivateUser(privateUserRow)
    const destinations = Object.fromEntries(
      PERP_ALERT_REASONS.map((reason) => [
        reason,
        getNotificationDestinationsForUser(privateUser, reason),
      ])
    ) as Record<
      (typeof PERP_ALERT_REASONS)[number],
      ReturnType<typeof getNotificationDestinationsForUser>
    >
    const enabled = Object.fromEntries(
      PERP_ALERT_REASONS.map((reason) => [
        reason,
        destinations[reason].sendToBrowser || destinations[reason].sendToMobile,
      ])
    ) as Record<(typeof PERP_ALERT_REASONS)[number], boolean>
    const saved = await tx.oneOrNone<{ data: PerpUserAlertState }>(
      `select data from perp_alert_states where user_id = $1`,
      [userId]
    )
    // Read positions and their committed oracle in the SAME statement snapshot.
    const rows = await tx.manyOrNone<
      Row<'contract_perp_positions'> & { contract: PerpContract }
    >(
      `select p.*, c.data as contract from contract_perp_positions p
       join contracts c on c.id = p.contract_id
       where p.user_id = $1 and p.size > 0 and c.mechanism = 'perp'
         and c.resolution_time is null
       order by p.contract_id, p.direction`,
      [userId]
    )
    const now = Date.now()
    const state: PerpUserAlertState = {
      positions: {},
      pnlAlertTimes: recentPerpPnlAlertTimes(
        saved?.data.pnlAlertTimes ?? [],
        now
      ),
    }
    const notifications: {
      notification: Notification
      browser: boolean
      mobile: boolean
    }[] = []
    for (const row of rows) {
      const position = rowToPosition(row)
      const key = `${position.contractId}:${position.direction}`
      const prior = saved?.data.positions[key]
      const contract = row.contract
      // Preserve previous state during a provider outage, but never notify on
      // stale prices, a solvency halt, a resolved market, or terminal position.
      if (prior) state.positions[key] = prior
      if (
        contract.isResolved ||
        contract.solvencyHaltTime != null ||
        getPerpOracleFreshness(contract, now).status !== 'fresh'
      )
        continue
      const result = evaluatePerpPositionAlert(
        position,
        contract.oraclePrice,
        prior,
        enabled,
        canSendPerpPnlAlert(state.pnlAlertTimes, now),
        now
      )
      if (!result) continue
      state.positions[key] = result.state
      if (!result.alert) continue
      const notification = makePerpPositionAlertNotification(
        contract,
        position,
        result.alert,
        now
      )
      const { sendToBrowser, sendToMobile } = destinations[result.alert.reason]
      if (sendToBrowser) {
        // Commit notification and dedup state together. Broadcast only AFTER
        // commit, so failed transactions neither show nor suppress an alert.
        await tx.none(
          `insert into user_notifications (user_id, notification_id, data) values ($1, $2, $3)`,
          [userId, notification.id, notification]
        )
      }
      notifications.push({
        notification,
        browser: sendToBrowser,
        mobile: sendToMobile,
      })
      if (result.alert.reason !== 'perp_liquidation_warning')
        state.pnlAlertTimes.push(now)
    }
    await tx.none(
      `insert into perp_alert_states (user_id, data) values ($1, $2)
       on conflict (user_id) do update set data = excluded.data`,
      [userId, state]
    )
    return { privateUser, notifications }
  })
  if (!delivery) return
  for (const { notification, browser, mobile } of delivery.notifications) {
    if (browser) broadcast(`user-notifications/${userId}`, { notification })
    if (mobile) {
      // Best-effort, at-most-once push attempt. No network I/O under the lock;
      // an Expo failure cannot roll back an already visible browser alert.
      try {
        await createPushNotifications([
          [
            delivery.privateUser,
            notification,
            notification.reason === 'perp_liquidation_warning'
              ? 'Perp liquidation warning'
              : 'Perp position update',
            notification.sourceText,
          ],
        ])
      } catch (error) {
        log.error('Failed to push perp position alert', {
          userId,
          notificationId: notification.id,
          error,
        })
      }
    }
  }
}
