import { runScript } from 'run-script'
import { denormalizeAnswers } from 'scheduler/jobs/denormalize-answers'

if (require.main === module) {
  runScript(async () => {
    await denormalizeAnswers()
  })
}
