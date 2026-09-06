import { runScript } from './run-script'

runScript(async ({ pg }) => {
  await pg.none(
    `update users set balance = 100000 where id = $1`,
    ['lu01Fs2BVnTQgFMMpS1qhYst9fs2']
  )
  console.log('Set @teststef balance to 100,000 mana')
})
