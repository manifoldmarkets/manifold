import { Post } from 'common/post'
import { run } from 'common/supabase/utils'
import { db } from './db'

export async function getPost(postId: string) {
  const { data: post } = await run(
    db.from('posts').select('data').eq('id', postId)
  )
  if (post.length > 0) {
    return post[0].data as Post
  }
  return null
}
