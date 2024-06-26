import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updateViewsAndViewersEmbeddings } from 'shared/helpers/embeddings'

export const updateContractViewEmbeddings = async () => {
  const pg = createSupabaseDirectClient()
  await updateViewsAndViewersEmbeddings(pg)
}
