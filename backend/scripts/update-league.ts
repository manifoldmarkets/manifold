import { runScript } from 'run-script'
import { updateLeagueCore } from 'functions/scheduled/update-league'

if (require.main === module) {
  runScript(async () => {
    await updateLeagueCore()
  })
}
