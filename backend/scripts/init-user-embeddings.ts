import { initAdmin } from 'shared/init-admin'
initAdmin()

import { createSupabaseDirectClient } from 'shared/supabase/init'
import {
  getAverageContractEmbedding,
  getInterestedContractIds,
} from 'shared/helpers/embeddings'

const pg = createSupabaseDirectClient()

async function main() {
  console.log('Starting init-user-embeddings.ts...')
  const userIds = await pg.map(
    'select id from users',
    [],
    (r: { id: string }) => r.id
  )
  for (const userId of userIds) {
    console.log('userId', userId)
    await pg.task('get-user-embedding', async (pg) => {
      const interestedContractIds = await getInterestedContractIds(pg, userId)
      const userEmbedding = await getAverageContractEmbedding(
        pg,
        interestedContractIds
      )
      await pg.none(
        'insert into user_embeddings (user_id, interest_embedding) values ($1, $2) on conflict (user_id) do update set interest_embedding = $2',
        [userId, userEmbedding]
      )
    })
  }
}

if (require.main === module) {
  main().then(() => process.exit())
}
