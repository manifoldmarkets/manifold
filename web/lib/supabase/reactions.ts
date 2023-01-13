import { run } from 'common/supabase/utils'
import { db } from 'web/lib/supabase/db'
import { Reaction } from 'common/reaction'

export type SearchLikedContent = Pick<
  Reaction,
  'id' | 'title' | 'slug' | 'contentId' | 'contentType' | 'text'
>
export async function getLikedContracts(userId: string) {
  const { data } = await run(
    db
      .from('user_reactions')
      // The best way to do this would be to join the matching table via contentId and contentType
      // but not sure if people even use this button, so we'll wait until someone complains
      .select(
        'reaction_id, data->title, data->slug, data->contentId, data->contentType, data->text'
      )
      .eq('user_id', userId)
      .eq('data->>type', 'like')
      .contains('data', { contentType: 'contract' })
      .order('data->>createdTime', { ascending: false })
  )
  return data as SearchLikedContent[]
}

export async function getLikedContractsCount(userId: string) {
  const { data } = await run(
    db
      .from('user_reactions')
      .select('count')
      .eq('user_id', userId)
      .eq('data->>type', 'like')
      .contains('data', { contentType: 'contract' })
  )
  return data[0].count as number
}
