import { getLocalEnv, initAdmin } from 'shared/init-admin'
initAdmin()

import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getServiceAccountCredentials, loadSecretsToEnv } from 'common/secrets'
import {
  getDefaultEmbedding,
  magnitude,
  normalize,
  updateUserDisinterestEmbeddingInternal,
  updateUserInterestEmbedding,
} from 'shared/helpers/embeddings'
import { chunk } from 'lodash'

async function main() {
  const credentials = getServiceAccountCredentials(getLocalEnv())
  await loadSecretsToEnv(credentials)
  const pg = createSupabaseDirectClient()

  console.log('Starting fix-user-embeddings.ts...')
  // const potentialVector = await pg.one(
  //   `
  //   select pre_signup_interest_embedding from user_embeddings
  //       where user_id = 'BkvvcG0IHBNL5WLp7Bs8ziDZwSk2'
  //   `,
  //   [],
  //   (r: { pre_signup_interest_embedding: string }) =>
  //     JSON.parse(r.pre_signup_interest_embedding) as number[]
  // )
  // console.log('potentialVector', magnitude(potentialVector))

  const totalUserIds = await pg.map(
    `select user_id from user_embeddings`,
    [],
    (r: { user_id: string }) => r.user_id
  )
  console.log(`Found ${totalUserIds.length} users with embeddings to fix`)
  const defaultEmbedding = await getDefaultEmbedding(pg)
  console.log('defaultEmbedding magnitude', magnitude(defaultEmbedding))
  // await pg.none(
  //   `UPDATE user_embeddings
  //    SET pre_signup_interest_embedding = $1
  //    WHERE pre_signup_embedding_is_default = true;`,
  //   [defaultEmbedding]
  // )
  // console.log('Updated pre-signup embeddings')
  let count = 0
  const chunks = chunk(totalUserIds, 500)
  for (const userIds of chunks) {
    await Promise.all(
      userIds.map(async (userId) => {
        await updateUserInterestEmbedding(pg, userId)
        await updateUserDisinterestEmbeddingInternal(pg, userId)
        const preSignupEmbedding = await pg.one(
          `select pre_signup_interest_embedding from user_embeddings where user_id = $1`,
          [userId],
          (r: { pre_signup_interest_embedding: string }) =>
            normalize(JSON.parse(r.pre_signup_interest_embedding) as number[])
        )
        await pg.none(
          `update user_embeddings set pre_signup_interest_embedding = $2 where user_id = $1`,
          [userId, preSignupEmbedding]
        )
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
