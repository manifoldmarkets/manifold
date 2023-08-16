import { runScript } from './run-script'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { LeagueBidTxn } from 'common/txn'
import { chunk, maxBy } from 'lodash'
import { getLeagueChatChannelId } from 'common/league-chat'
import * as admin from 'firebase-admin'
import { runReturnLeagueBidTxn } from 'shared/txn/run-txn'

if (require.main === module) {
  runScript(async ({ pg }) => {
    const season = 4

    const leagues = await pg.map(
      `
      select distinct division, cohort from leagues
         where season = $1;`,
      [season],
      (row) => ({
        season,
        division: row.division,
        cohort: row.cohort,
      })
    )
    const chunked = chunk(leagues, 20)
    for (const chunk of chunked) {
      await Promise.all(
        chunk.map(async (league) =>
          returnBidForLeague(season, league.division, league.cohort)
        )
      )
    }
  })
}
const returnBidForLeague = async (
  season: number,
  division: number,
  cohort: string
) => {
  const res = await firestore.runTransaction(async (transaction) => {
    const leagueId = `${season}-${division}-${cohort}`
    const bidsSnapshot = await transaction.get(
      firestore
        .collection('txns')
        .where('category', '==', 'LEAGUE_BID')
        .where('toId', '==', leagueId)
    )
    const bids = bidsSnapshot.docs.map((doc) => doc.data() as LeagueBidTxn)
    const maxBid = maxBy(bids, (bid) => bid.amount)

    if (maxBid) {
      const refundsSnapshot = await transaction
        .get(
          firestore
            .collection('txns')
            .where('category', '==', 'LEAGUE_BID')
            .where('amount', '==', maxBid.amount)
            .where('fromId', '==', leagueId)
            .where('toType', '==', 'USER')
        )
        .catch((err) => {
          console.log('error getting refunds for', maxBid)
          throw err
        })

      if (refundsSnapshot.docs.length <= 0) {
        console.log(
          'got',
          season,
          division,
          cohort,
          'with max bid',
          maxBid?.amount,
          'but no refunds'
        )
        runReturnLeagueBidTxn(transaction, maxBid)
      } else {
        console.log(
          'got',
          season,
          division,
          cohort,
          'with max bid',
          maxBid?.amount,
          'and refunds',
          refundsSnapshot.docs.map((doc) => doc.data())
        )
      }
    }

    const pg = createSupabaseDirectClient()
    await pg.none(
      `update league_chats set owner_id = null where channel_id = $1`,
      [getLeagueChatChannelId(season, division, cohort)]
    )
    return { status: 'success' }
  })
  res.status === 'success' &&
    console.log('done with ', season, division, cohort)
}

const firestore = admin.firestore()
