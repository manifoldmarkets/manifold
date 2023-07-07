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
