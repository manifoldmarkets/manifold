import * as admin from 'firebase-admin'
import { SupabaseClient } from 'common/supabase/utils'
import { getServiceAccountCredentials, initAdmin } from 'shared/init-admin'
import { loadSecretsToEnv } from 'shared/secrets'
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
  const credentials = getServiceAccountCredentials()
  await loadSecretsToEnv(credentials)

  const db = createSupabaseClient()
  const pg = createSupabaseDirectClient()
  const firestore = admin.firestore()
  await main({ db, pg, firestore })

  process.exit()
}
