import {
  getLeaguePrize,
  league_user_info,
  LeagueChangeNotificationData,
} from 'common/leagues'
import { SupabaseTransaction } from './supabase/init'
import { createLeagueChangedNotifications } from './create-notification'
import { TxnData, insertTxns } from './txn/run-txn'
import { bulkIncrementBalances } from './supabase/users'

import { log } from './utils'

export const sendEndOfSeasonNotificationsAndBonuses = async (
  pg: SupabaseTransaction,
  prevSeason: number,
  newSeason: number
) => {
  const prevRows = await pg.manyOrNone<league_user_info>(
    `select * from user_league_info
    where season = $1`,
    [prevSeason]
  )
  const newRows = await pg.manyOrNone<league_user_info>(
    `select * from user_league_info
    where season = $1`,
    [newSeason]
  )
  const prevRowsByUserId = Object.fromEntries(
    prevRows.map((r) => [r.user_id, r])
  )

  // Fetch all users who already received prizes for this season
  const alreadyGotPrizeRows = await pg.manyOrNone<{ to_id: string }>(
    `select to_id from txns
     where category = 'LEAGUE_PRIZE'
     and data->'data'->>'season' = $1`,
    [prevSeason.toString()]
  )
  // Create a Set for efficient lookups
  const alreadyGotPrizeUserIds = new Set(
    alreadyGotPrizeRows.map((row) => row.to_id)
  )

  const notificationData: LeagueChangeNotificationData[] = []

  const prizesToAward: Array<{
    userId: string
    prevRow: league_user_info
    newRow: league_user_info
    prize: number
  }> = []

  // Check eligibility for users in this chunk
  for (const newRow of newRows) {
    const prevRow = prevRowsByUserId[newRow.user_id]
    if (!prevRow) {
      notificationData.push({
        userId: newRow.user_id,
        previousLeague: undefined,
        newLeague: newRow,
        bonusAmount: 0,
      })
      continue
    }

    const prize = getLeaguePrize(prevRow.division, prevRow.rank)
    if (!prize || prize <= 0) {
      notificationData.push({
        userId: newRow.user_id,
        previousLeague: prevRow,
        newLeague: newRow,
        bonusAmount: 0,
      })
      continue
    }

    // Check if prize already awarded using our Set
    if (!alreadyGotPrizeUserIds.has(newRow.user_id)) {
      prizesToAward.push({
        userId: newRow.user_id,
        prevRow,
        newRow,
        prize,
      })
    } else {
      log(
        `User ${newRow.user_id} already received prize for season ${prevSeason}`
      )
    }
  }

  if (prizesToAward.length > 0) {
    const balanceIncrements: Array<{
      id: string
      balance: number
      totalDeposits: number
    }> = []
    const txnDatas: TxnData[] = []
    const prizeNotifications: LeagueChangeNotificationData[] = []

    for (const prizeAward of prizesToAward) {
      const { userId, prevRow, newRow, prize } = prizeAward

      // Prepare balance increment data
      balanceIncrements.push({
        id: userId,
        balance: prize,
        totalDeposits: prize,
      })

      // Construct transaction data - including fromId now
      const txnData: TxnData = {
        fromId: 'BANK',
        fromType: 'BANK',
        toId: userId,
        toType: 'USER',
        amount: prize,
        token: 'M$',
        category: 'LEAGUE_PRIZE',
        data: { ...prevRow, season: prevSeason },
      }
      txnDatas.push(txnData)

      // Prepare notification data
      prizeNotifications.push({
        userId,
        previousLeague: prevRow,
        newLeague: newRow,
        bonusAmount: prize,
      })
    }

    // Execute bulk updates and inserts within the transaction
    // Pass the transaction object 'tx' to the helper functions
    await bulkIncrementBalances(pg, balanceIncrements)
    await insertTxns(pg, txnDatas)

    // Add notifications to the main list only if the transaction succeeds
    notificationData.push(...prizeNotifications)
  }

  // Call the bulk notification function after collecting all data
  if (notificationData.length > 0) {
    log(`Sending ${notificationData.length} league change notifications.`)
    await createLeagueChangedNotifications(pg, notificationData)
  } else {
    log(`No league change notifications to send for season ${prevSeason}.`)
  }
}
