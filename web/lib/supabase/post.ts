import { Post } from 'common/post'
import { run } from 'common/supabase/utils'
import { db } from './db'

export async function getPost(postId: string) {
  const { data: post } = await run(
    db.from('posts').select('data').eq('id', postId)
  )
  if (post && post.length > 0) {
    return post[0].data as Post
  } else {
    return null
  }
}

export async function getPostsByUser(userId: string) {
  const { data: posts } = await run(
    db.from('posts').select('data').contains('data', { creatorId: userId })
  )
  if (posts && posts.length > 0) {
    return posts.map((post) => {
      return post.data as Post
    })
  } else {
    return null
  }
}
