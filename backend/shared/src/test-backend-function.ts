import { getServiceAccountCredentials, loadSecretsToEnv } from 'common/secrets'
import { getLocalEnv } from 'shared/init-admin'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import {
  getDefaultEmbedding,
  magnitude,
  normalize,
  updateUsersViewEmbeddings,
} from 'shared/helpers/embeddings'

// Ian's file for debugging
export async function testBackendFunction() {
  const credentials = getServiceAccountCredentials(getLocalEnv())
  await loadSecretsToEnv(credentials)
  try {
    const pg = createSupabaseDirectClient()
    const db = createSupabaseClient()
    // await scoreContractsInternal(db, pg)
    const defaultEmbedding = await getDefaultEmbedding(pg)
    console.log('defaultEmbedding', defaultEmbedding)
    console.log('magnitude', magnitude(defaultEmbedding))
    const normDefault = normalize(defaultEmbedding)
    const u = await pg.map(
      `
    select interest_embedding from postgres.public.user_embeddings where user_id = 'XUpH3HIea7fkMNRQmcs9gzPJBBK2'`,
      [],
      (r: { interest_embedding: string }) =>
        JSON.parse(r.interest_embedding) as number[]
    )
    console.log('user', u)
    console.log('magnitude', magnitude(u[0]))

    console.log('normalized', normDefault)
    console.log('magnitude', magnitude(normDefault))
    await updateUsersViewEmbeddings(pg)
    // await getUsersWithSimilarInterestVectorsToContract(
    //   'YTIuuSsNRn2OlA4KykRM',
    //   pg,
    //   0.15
    // )
  } catch (e) {
    console.error(e)
  }
}
