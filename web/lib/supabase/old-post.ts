import { OldPost } from 'common/old-post'
import { Row, convertSQLtoTS, run } from 'common/supabase/utils'
import { db } from './db'

export function postPath(postSlug: string) {
  return `/old-post/${postSlug}`
}

export async function getPostBySlug(slug: string) {
  const { data } = await run(
    db.from('old_posts').select().eq('data->>slug', slug)
  )
  if (data && data.length > 0) {
    return convertPost(data[0])
  }
  return null
}

const convertPost = (sqlPost: Row<'old_posts'>) =>
  convertSQLtoTS<'old_posts', OldPost>(sqlPost, {
    fs_updated_time: false,
    created_time: false, // grab from data
  })
