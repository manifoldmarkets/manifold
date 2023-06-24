import { runScript } from 'run-script'
import { calculateImportanceScore } from 'shared/importance-score'

if (require.main === module) {
  runScript(async ({ firestore, db, pg }) => {
    const readOnly = true
    await calculateImportanceScore(firestore, db, pg, readOnly)
  })
}
