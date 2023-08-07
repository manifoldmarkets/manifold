import * as admin from 'firebase-admin'

import { getLeaguePrize, league_user_info } from 'common/leagues'
import { SupabaseDirectClient } from './supabase/init'
import { createLeagueChangedNotification } from './create-notification'
import { runTxnFromBank } from './txn/run-txn'

import { LeaguePrizeTxn } from 'common/txn'
import { chunk } from 'lodash'

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

  for (const rows of chunk(newRows, 20)) {
    await Promise.all(
      rows.map((newRow) => {
        const prevRow = prevRowsByUserId[newRow.user_id] as
          | league_user_info
          | undefined
        if (prevRow) {
          return sendEndOfSeasonNotificationAndBonus(pg, prevRow, newRow)
        }
        return Promise.resolve()
      })
    )
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
    const data: Omit<LeaguePrizeTxn, 'fromId' | 'id' | 'createdTime'> = {
      fromType: 'BANK',
      toId: userId,
      toType: 'USER',
      amount: prize,
      token: 'M$',
      category: 'LEAGUE_PRIZE',
      data: prevRow,
    }
    await firestore.runTransaction(async (transaction) => {
      await runTxnFromBank(transaction, data)
    })
  }
  await createLeagueChangedNotification(userId, prevRow, newRow, prize, pg)
}
