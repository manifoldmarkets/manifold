import { initAdmin } from 'shared/init-admin'
initAdmin()

import { sendTrendingQuestionsEmailsToAllUsers } from 'functions/scheduled/weekly-questions-emails'
import { getServiceAccountCredentials } from 'shared/init-admin'
import { loadSecretsToEnv } from 'common/secrets'

const main = async () => {
  const credentials = getServiceAccountCredentials()
  await loadSecretsToEnv(credentials)
  await sendTrendingQuestionsEmailsToAllUsers(true)
  process.exit()
}
if (require.main === module) {
  main()
}
