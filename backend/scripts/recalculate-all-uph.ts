import { recalculateAllUserPortfolios } from 'shared/mana-supply'
import { runScript } from './run-script'

if (require.main === module) {
  runScript(async ({ pg }) => {
    await recalculateAllUserPortfolios(pg)
  })
}
