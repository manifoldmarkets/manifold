import { runScript } from 'run-script'
import { denormalizeContractAnswers } from 'functions/scheduled/denormalize-answers'

if (require.main === module) {
  runScript(async ({ db }) => {
    await denormalizeContractAnswers(db, ['ieywZhEmvi6ynaFSywX5'])
  })
}
