import { runScript } from './run-script'

runScript(async ({ pg }) => {
  // Check answers table
  const rows = await pg.manyOrNone(
    `select a.text as ans_text,
            jsonb_array_elements(c.data->'answers')->>'text' as data_text
     from answers a
     join contracts c on c.id = a.contract_id
     where c.data->>'sportsLeague' = 'FIFA World Cup'
       and c.data->>'creatorId' = 'lu01Fs2BVnTQgFMMpS1qhYst9fs2'
     order by c.data->>'closeTime', a.index
     limit 3`
  )
  rows.forEach((r) => {
    console.log(`answers.text: "${r.ans_text}"`)
    console.log(`contracts.data.answers.text: "${r.data_text}"`)
    console.log('---')
  })
})
