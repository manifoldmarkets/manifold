import { SupabaseClient } from '@supabase/supabase-js'

export async function getIsAdmin(
  db: SupabaseClient,
  userId: string | undefined | null
) {
  const { data: is_admin } = await db.rpc('is_admin', { input_string: userId })
  return is_admin
}
