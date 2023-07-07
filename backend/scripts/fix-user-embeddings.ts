import { getLocalEnv, initAdmin } from 'shared/init-admin'
initAdmin()

import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getServiceAccountCredentials, loadSecretsToEnv } from 'common/secrets'
import {
  getDefaultEmbedding,
  updateUserDisinterestEmbeddingInternal,
  updateUserInterestEmbedding,
} from 'shared/helpers/embeddings'
import { chunk } from 'lodash'

async function main() {
  const credentials = getServiceAccountCredentials(getLocalEnv())
  await loadSecretsToEnv(credentials)
  const pg = createSupabaseDirectClient()

  console.log('Starting fix-user-embeddings.ts...')
  const totalUserIds = await pg.map(
    `
        select user_id
         from user_embeddings
          where pre_signup_embedding_is_default = true
        `,
    [],
    (r: { user_id: string }) => r.user_id
  )
  console.log(
    `Found ${totalUserIds.length} users with bad pre-signup embeddings`
  )
  const defaultEmbedding = await getDefaultEmbedding(pg)
  console.log('defaultEmbedding', defaultEmbedding)
  await pg.none(
    `UPDATE user_embeddings
     SET pre_signup_interest_embedding = $1
     WHERE pre_signup_embedding_is_default = true;`,
    [defaultEmbedding]
  )
  console.log('Updated pre-signup embeddings')
  let count = 0
  const chunks = chunk(totalUserIds, 500)
  for (const userIds of chunks) {
    await Promise.all(
      userIds.map((userId) => {
        updateUserInterestEmbedding(pg, userId)
        updateUserDisinterestEmbeddingInternal(pg, userId)
      })
    )
    count += userIds.length
    console.log(`Updated ${count} of ${totalUserIds.length} users`)
  }
}

if (require.main === module) {
  main()
    .then(() => process.exit())
    .catch((e) => {
      console.error(e)
      process.exit(1)
    })
}
