import { runScript } from './run-script'
import { log } from 'shared/utils'
import { getManaSupply } from 'shared/mana-supply'

if (require.main === module) {
  runScript(async ({ pg }) => {
    log('Getting mana supply...')
    const manaSupply = await getManaSupply(pg)
    console.log(manaSupply)
  })
}
