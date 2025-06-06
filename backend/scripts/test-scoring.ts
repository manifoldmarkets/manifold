import { runScript } from 'run-script'
import { calculateImportanceScore } from 'shared/importance-score'

if (require.main === module) {
  runScript(async ({ pg }) => {
    const readOnly = true
    const rescoreAll = true
    await calculateImportanceScore(pg, readOnly, rescoreAll)
  })
}
