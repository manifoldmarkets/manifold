import {
  calculateImportanceScore,
  calculatePostImportanceScore,
} from 'shared/importance-score'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'

export const scoreContracts = async () => {
  const pg = createSupabaseDirectClient()
  await calculateImportanceScore(pg)
  await calculatePostImportanceScore(pg)
}
