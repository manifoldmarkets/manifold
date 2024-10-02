import { getLeaguePrize, league_user_info } from 'common/leagues'
import { SupabaseDirectClient } from './supabase/init'
import { createLeagueChangedNotification } from './create-notification'
import { runTxn, runTxnFromBank } from './txn/run-txn'

import { LeaguePrizeTxn } from 'common/txn'
import { chunk } from 'lodash'
import { TWOMBA_ENABLED } from 'common/envs/constants'

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

  for (const rows of chunk(newRows, 5)) {
    await Promise.all(
      rows.map((newRow) => {
        const prevRow = prevRowsByUserId[newRow.user_id] as
          | league_user_info
          | undefined
        if (prevRow) {
          return sendEndOfSeasonNotificationAndBonus(
            pg,
            prevRow,
            newRow,
            prevSeason
          )
        }
        return Promise.resolve()
      })
    )
  }
}

const sendEndOfSeasonNotificationAndBonus = async (
  pg: SupabaseDirectClient,
  prevRow: league_user_info,
  newRow: league_user_info,
  season: number
) => {
  const { user_id: userId, division, rank } = prevRow

  const prize = getLeaguePrize(division, rank)
  if (!prize) return

  const data: any = {
    fromId: userId,
    fromType: 'USER',
    toType: 'BANK',
    toId: 'BANK',
    amount: prize,
    token: 'CASH',
    category: 'LEAGUE_PRIZE_UNDO',
    data: prevRow,
  }

  const alreadyGotPrizeReverted = await pg.oneOrNone(
    `select * from txns
      where category = 'LEAGUE_PRIZE_UNDO'
      and data->'data'->>'season' = $1
      and from_id = $2`,
    [season.toString(), userId]
  )

  if (!alreadyGotPrizeReverted) {
    console.log(
      'unsend',
      newRow.user_id,
      'division',
      division,
      'rank',
      rank,
      'prize',
      prize
    )

    // console.log(data)
    await pg.tx(async (tx) => {
      await runTxn(tx, data)
      // await createLeagueChangedNotification(userId, prevRow, newRow, prize, tx)
    })
  }
}
