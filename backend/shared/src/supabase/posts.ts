import { SupabaseDirectClient } from './init'
import { TopLevelPost } from 'common/top-level-post'

export async function getPost(pg: SupabaseDirectClient, postId: string): Promise<TopLevelPost | null> {
  const row = await pg.oneOrNone(
    `SELECT data FROM old_posts WHERE id = $1`,
    [postId]
  )
  return row ? (row.data as TopLevelPost) : null
}