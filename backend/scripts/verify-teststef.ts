import { runScript } from './run-script'

runScript(async ({ pg }) => {
  // Use the ID from give-dev-mana.ts which is known to be teststef
  const result = await pg.oneOrNone(
    `UPDATE users SET data = jsonb_set(data, '{bonusEligibility}', '"grandfathered"')
     WHERE id = 'lu01Fs2BVnTQgFMMpS1qhYst9fs2'
     RETURNING data->>'username' as username, data->>'bonusEligibility' as bonus_eligibility`
  )
  if (result) {
    console.log(`Updated ${result.username}: bonusEligibility = ${result.bonus_eligibility}`)
  } else {
    console.log('User not found')
  }
})
