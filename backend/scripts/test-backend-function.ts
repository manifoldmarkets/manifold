import { initAdmin } from 'shared/init-admin'
initAdmin()
import { saveWeeklyContractMetricsInternal } from 'functions/scheduled/weekly-portfolio-updates'

async function testScheduledFunction() {
  try {
    await saveWeeklyContractMetricsInternal()
  } catch (e) {
    console.error(e)
  }
}

if (require.main === module) testScheduledFunction().then(() => process.exit())
