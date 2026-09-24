import { runScript } from 'run-script'
import { Answer } from 'common/answer'
import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import { gameAnswerColorBackfill } from 'common/sports-team-colors'
import { convertAnswer } from 'common/supabase/contracts'
import { updateAnswers } from 'shared/supabase/answers'

// Gives open Odds API game markets their team colours, for games created
// before markets were coloured at creation. Answers someone has renamed or
// recoloured are left alone. Prints the plan; pass --apply to write it.

if (require.main === module) {
  runScript(async ({ pg }) => {
    const apply = process.argv.includes('--apply')
    const markets = await pg.manyOrNone<{
      id: string
      question: string
      data: {
        sportsLeague?: string
        sportsHomeTeam?: string
        sportsAwayTeam?: string
      }
    }>(
      `select id, question, data from contracts
       where resolution is null
         and mechanism = 'cpmm-multi-1'
         and creator_id = any($1)
         and data->>'sportsEventId' like 'odds:%'
         and data->>'sportsMarketType' = 'moneyline'`,
      [MANIFOLD_SPORTS_USER_IDS]
    )
    let changed = 0
    for (const market of markets) {
      const answers: Answer[] = await pg.map(
        `select * from answers where contract_id = $1`,
        [market.id],
        convertAnswer
      )
      const updates = gameAnswerColorBackfill(market.data, answers)
      if (!updates) {
        console.log(`skip  ${market.question}`)
        continue
      }
      changed++
      console.log(
        `${apply ? 'write' : 'plan '} ${market.question}: ${updates
          .map((u) => u.color)
          .join(' ')}`
      )
      if (apply) await updateAnswers(pg, market.id, updates)
    }
    console.log(
      `${changed} of ${markets.length} open game markets ${
        apply ? 'recoloured' : 'would be recoloured; pass --apply to write'
      }`
    )
  })
}
