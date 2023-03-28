import { initAdmin } from 'shared/init-admin'
initAdmin()
import { resetQuestStatsInternal } from 'functions/scheduled/reset-quests-stats'

async function testScheduledFunction() {
  try {
    await resetQuestStatsInternal()
  } catch (e) {
    console.error(e)
  }
}

if (require.main === module) testScheduledFunction().then(() => process.exit())
