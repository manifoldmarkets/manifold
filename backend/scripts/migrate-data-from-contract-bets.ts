import { runScript } from 'run-script'
import { log } from 'shared/utils'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { ranges } from './backfill-loan-amount'

if (require.main === module) {
  runScript(async () => {
    const pg = createSupabaseDirectClient()
    for (const range of ranges) {
      log(`Processing range ${range.start} to ${range.end}`)
      await pg.task(async (t) => {
        await t.none(
          // Works bc contract_bet_populate_cols reads from the data blob and sets the column
          `update contract_bets
             set bet_id = bet_id
             where bet_id >= $1
               and ($2 is null or bet_id < $2)
               and (is_filled is null and data ->> 'isFilled' is not null) or
                  (is_cancelled is null and data ->> 'isCancelled' is not null)
               `,
          [range.start, range.end]
        )
        log(`Converted ${range.start} to ${range.end}`)
      })
    }
  })
}
