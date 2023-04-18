import * as admin from 'firebase-admin'
import { SupabaseClient } from 'common/supabase/utils'
import { getFirebaseActiveProject, initAdmin } from 'shared/init-admin'
import { getServiceAccountCredentials, loadSecretsToEnv } from 'common/secrets'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'

initAdmin()

export const runScript = async (
  main: (services: {
    db: SupabaseClient
    pg: SupabaseDirectClient
    firestore: admin.firestore.Firestore
  }) => Promise<any> | any
) => {
  const activeProject = getFirebaseActiveProject(process.cwd())
  if (activeProject == null) {
    throw new Error(
      "Couldn't find active Firebase project; did you do `firebase use <alias>?`"
    )
  }

  const env = activeProject.toUpperCase() as 'PROD' | 'DEV'
  const credentials = getServiceAccountCredentials(env)

  await loadSecretsToEnv(credentials)

  const db = createSupabaseClient()
  const pg = createSupabaseDirectClient()
  const firestore = admin.firestore()
  await main({ db, pg, firestore })

  process.exit()
}
