import { getServiceAccountCredentials, loadSecretsToEnv } from 'common/secrets'
import { getLocalEnv } from 'shared/init-admin'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'

import { upsertGroupEmbedding } from 'shared/helpers/embeddings'

// Ian's file for debugging
export async function testBackendFunction() {
  const credentials = getServiceAccountCredentials(getLocalEnv())
  await loadSecretsToEnv(credentials)
  try {
    const pg = createSupabaseDirectClient()
    const db = createSupabaseClient()
    const groupIds = await pg.map(
      `select id from groups`,
      [],
      (r: { id: string }) => r.id
    )

    for (const groupId of groupIds) {
      await upsertGroupEmbedding(pg, groupId)
    }
  } catch (e) {
    console.error(e)
  }
}
