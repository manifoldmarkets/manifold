import { Row } from 'common/supabase/utils'
import { groupBy, uniq, sumBy } from 'lodash'
import { runScript } from 'run-script'
import { runTxn } from 'shared/txn/run-txn'

runScript(async ({ pg }) => {
  const leaguePayouts = await pg.any<Row<'txns'>>(
    `select * from txns where category = 'LEAGUE_PRIZE'
    and token = 'CASH'`
  )

  const leagueUndos = await pg.any<Row<'txns'>>(
    `select * from txns where category = 'LEAGUE_PRIZE_UNDO' and token = 'CASH'`
  )

  const uniqueUsers = uniq([
    ...leaguePayouts.map((txn) => txn.to_id),
    ...leagueUndos.map((txn) => txn.from_id),
  ])

  const payoutsByUser = groupBy(leaguePayouts, 'to_id')
  const undosByUser = groupBy(leagueUndos, 'from_id')

  for (const id of uniqueUsers) {
    const delta =
      (sumBy(payoutsByUser[id] ?? [], 'amount') ?? 0) -
      (sumBy(undosByUser[id] ?? [], 'amount') ?? 0)

    // console.log(id, delta)
    if (delta != 0) {
      // take back delta amount of CASH
      const txn = {
        fromId: id,
        fromType: 'USER',
        toType: 'BANK',
        toId: 'BANK',
        amount: delta,
        token: 'CASH',
        category: 'LEAGUE_PRIZE_UNDO',
      } as any

      // if (id == 'uglwf3YKOZNGjjEXKc5HampOFRE2') console.log(txn)

      await pg.tx(async (tx) => {
        await runTxn(tx, txn)
      })
    }
  }
})
