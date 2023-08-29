import { runScript } from 'run-script'
import { updateLoansCore } from 'functions/scheduled/update-loans'

if (require.main === module) {
  runScript(async () => {
    await updateLoansCore()
  })
}
