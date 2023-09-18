import { SupabaseDirectClient } from 'shared/supabase/init'

export const getMemberGroupSlugs = async (
  userId: string,
  pg: SupabaseDirectClient
): Promise<string[]> => {
  return await pg.map(
    `select slug from groups where id in (
        select group_id from group_members where member_id = $1
    )`,
    [userId],
    (r) => r.slug as string
  )
}
export const getGroupIdFromSlug = async (
  slug: string,
  pg: SupabaseDirectClient
): Promise<string> => {
  return await pg.one(
    `select id from groups where slug = $1`,
    [slug],
    (r) => r.id as string
  )
}
