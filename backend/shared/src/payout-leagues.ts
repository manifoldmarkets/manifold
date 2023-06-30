import * as admin from 'firebase-admin'

import { getLeaguePrize, league_user_info } from 'common/leagues'
import { SupabaseDirectClient } from './supabase/init'
import { createLeagueChangedNotification } from './create-notification'
import { runTxn } from './txn/run-txn'
import { isProd } from './utils'
import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  HOUSE_LIQUIDITY_PROVIDER_ID,
} from 'common/antes'
import { LeaguePrizeTxn } from 'common/txn'

export const sendEndOfSeasonNotificationsAndBonuses = async (
  pg: SupabaseDirectClient,
  prevSeason: number
) => {
  const newSeason = prevSeason + 1
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

  for (const newRow of newRows) {
    const prevRow = prevRowsByUserId[newRow.user_id] as
      | league_user_info
      | undefined
    if (prevRow) {
      await sendEndOfSeasonNotificationAndBonus(pg, prevRow, newRow)
    }
  }
}

const sendEndOfSeasonNotificationAndBonus = async (
  pg: SupabaseDirectClient,
  prevRow: league_user_info,
  newRow: league_user_info
) => {
  const { user_id: userId, division, rank } = prevRow

  const prize = getLeaguePrize(division, rank)
  console.log(
    'send',
    newRow.user_id,
    'division',
    division,
    'rank',
    rank,
    'prize',
    prize
  )

  if (prize) {
    const firestore = admin.firestore()
    const ref = firestore.collection('txns').doc()
    const data: LeaguePrizeTxn = {
      id: ref.id,
      fromId: isProd()
        ? HOUSE_LIQUIDITY_PROVIDER_ID
        : DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
      fromType: 'BANK',
      toId: userId,
      toType: 'USER',
      amount: prize,
      token: 'M$',
      category: 'LEAGUE_PRIZE',
      data: prevRow,
      createdTime: Date.now(),
    }
    await firestore.runTransaction(async (transaction) => {
      await runTxn(transaction, data)
    })
  }
  await createLeagueChangedNotification(userId, prevRow, newRow, prize, pg)
}
