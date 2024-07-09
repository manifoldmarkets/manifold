import { runScript } from 'run-script'
import { log } from 'shared/utils'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { MINUTE_MS } from 'common/util/time'

if (require.main === module) {
  const argv = yargs(hideBin(process.argv))
    .option('timeout', {
      alias: 't',
      description: 'Timeout in seconds for the database connection',
      type: 'number',
      default: 10 * MINUTE_MS,
    })
    .help()
    .alias('help', 'h')
    .parse() as { timeout: number }

  runScript(async () => {
    let retries = 0
    const maxRetries = 1
    let converted = 0
    const runBackfill = async () => {
      const pg = createSupabaseDirectClient()

      while (true) {
        log(`fetching bets to convert`)
        const betIds = await pg.timeout(argv.timeout, (t) =>
          t.map(
            `select bet_id
       from contract_bets
       where loan_amount is null
       and data->>'loanAmount' is not null
       order by created_time
       limit 5000`,
            [converted],
            (row) => row.bet_id as string
          )
        )
        if (betIds.length < 1) {
          log(`no more bets to convert`)
          break
        }
        log(`converting bets`, betIds.length)
        await pg.none(
          `update contract_bets
       set loan_amount = (data ->> 'loanAmount')::numeric
       where bet_id in ($1:list)`,
          [betIds]
        )
        converted += betIds.length
        log(`converted ${betIds.length} bets`)
        log(`total converted ${converted} bets`)
      }
    }

    while (retries < maxRetries) {
      try {
        await runBackfill()
        break // If successful, exit the retry loop
      } catch (error) {
        retries++
        log(`Attempt ${retries} failed`)
        if (retries >= maxRetries) {
          log(`Max retries (${maxRetries}) reached. Script failed.`)
          throw error
        }
        log(`Retrying in a 5 seconds...`)
        await new Promise((resolve) => setTimeout(resolve, 5000))
      }
    }
  })
}
