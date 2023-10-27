import { run, selectFrom } from 'common/supabase/utils'
import { db } from 'web/lib/supabase/db'
import { Reaction } from 'common/reaction'

export type SearchLikedContent = Pick<
  Reaction,
  'id' | 'title' | 'slug' | 'contentId' | 'contentType' | 'text'
>

export async function getLikedContracts(userId: string) {
  // The best way to do this would be to join the matching table via contentId and contentType
  // but not sure if people even use this button, so we'll wait until someone complains
  const { data } = await run(
    selectFrom(
      db,
      'user_reactions',
      'title',
      'slug',
      'contentId',
      'contentType',
      'text'
    )
      .eq('user_id', userId)
      .eq('data->>type', 'like')
      .contains('data', { contentType: 'contract' })
      .order('data->>createdTime' as any, { ascending: false })
  )
  return data as SearchLikedContent[]
}

export async function getLikedContractsCount(userId: string) {
  const { count } = await run(
    db
      .from('user_reactions')
      .select('*', { head: true, count: 'exact' })
      .eq('user_id', userId)
      .eq('data->>type', 'like')
      .contains('data', { contentType: 'contract' })
  )
  return count
}
