import { runScript } from 'run-script'
import { testScoreContractsInternal } from 'shared/score-contracts-internal'

if (require.main === module) {
  runScript(async ({ firestore, db, pg }) => {
    await testScoreContractsInternal(firestore, db, pg)
  })
}
