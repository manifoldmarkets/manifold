import { initAdmin } from 'shared/init-admin'
initAdmin()

import { sendTrendingMarketsEmailsToAllUsers } from 'functions/scheduled/weekly-markets-emails'
import { getServiceAccountCredentials } from 'shared/init-admin'
import { loadSecretsToEnv } from 'shared/secrets'

const main = async () => {
  const credentials = getServiceAccountCredentials()
  await loadSecretsToEnv(credentials)
  await sendTrendingMarketsEmailsToAllUsers(true)
  process.exit()
}
if (require.main === module) {
  main()
}
