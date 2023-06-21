import { getLocalEnv, initAdmin } from 'shared/init-admin'
initAdmin()

import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getServiceAccountCredentials, loadSecretsToEnv } from 'common/secrets'
import { updateUserInterestEmbedding } from 'shared/helpers/embeddings'

async function main() {
  const credentials = getServiceAccountCredentials(getLocalEnv())
  await loadSecretsToEnv(credentials)
  const pg = createSupabaseDirectClient()

  console.log('Starting fix-user-embeddings.ts...')
  const userIds = await pg.map(
    `
        with ce as (
            select embedding
            from contract_embeddings
            where contract_id = 'BKr7KGDSkT6U3dGlqxIk'
        )
        select user_id, distance
        from (
                 select ue.user_id, (select embedding from ce) <=> ue.interest_embedding as distance
                 from user_embeddings as ue
             ) as distances
        where distance = 'Nan';`,
    [],
    (r: { user_id: string }) => r.user_id
  )
  console.log(`Found ${userIds.length} users with NaN interest embeddings`)
  await Promise.all(
    userIds.map((userId) => updateUserInterestEmbedding(pg, userId))
  )
}

if (require.main === module) {
  main().then(() => process.exit())
}
