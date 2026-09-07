import { runScript } from './run-script'

runScript(async ({ pg }) => {
  const rows = await pg.manyOrNone<{ id: string; question: string }>(
    `select id, data->>'question' as question
     from contracts
     where data->>'sportsLeague' = 'FIFA World Cup'
       and data->>'creatorId' = 'lu01Fs2BVnTQgFMMpS1qhYst9fs2'
       and token = 'MANA'`
  )

  console.log(`Found ${rows.length} markets to delete:`)
  rows.forEach((r) => console.log(` - ${r.question} (${r.id})`))

  if (rows.length === 0) return

  const ids = rows.map((r) => r.id)

  await pg.none(`delete from answers where contract_id = any($1)`, [ids])
  await pg.none(`delete from contract_bets where contract_id = any($1)`, [ids])
  await pg.none(`delete from contracts where id = any($1)`, [ids])

  console.log(`Deleted ${rows.length} markets.`)
})
