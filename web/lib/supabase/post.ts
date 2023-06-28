import { DateDoc, Post } from 'common/post'
import { run } from 'common/supabase/utils'
import { db } from './db'
import { getUserByUsername } from 'web/lib/supabase/users'

export function postPath(postSlug: string) {
  return `/post/${postSlug}`
}

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

export async function getPostBySlug(slug: string) {
  const { data: posts } = await run(
    db.from('posts').select('data').eq('data->>slug', slug)
  )
  if (posts && posts.length > 0) {
    return posts[0].data as Post
  }
  return null
}

export async function getAllPosts() {
  const { data } = await run(
    db
      .from('posts')
      .select('data')
      .order('created_time', { ascending: false } as any)
  )
  return data.map((d) => d.data) as Post[]
}

export async function getPostsByGroup(groupId: string) {
  const { data } = await run(
    db.from('posts').select('data').eq('group_id', groupId)
  )
  return data.map((d) => d.data) as Post[]
}

export async function getPostsByUser(userId: string) {
  const { data: posts } = await run(
    db
      .from('posts')
      .select('data')
      .eq('creator_id', userId)
      .order('created_time', { ascending: false } as any)
  )
  if (posts && posts.length > 0) {
    return posts.map((post) => {
      return post.data as Post
    })
  } else {
    return [] as Post[]
  }
}

export async function getDateDocs() {
  const { data } = await run(
    db
      .from('posts')
      .select('data')
      .eq('data->>type', 'date-doc')
      .order('created_time', { ascending: false } as any)
  )
  return data.map((d) => d.data) as DateDoc[]
}

export async function getDateDoc(username: string) {
  const user = await getUserByUsername(username)

  if (!user) return null

  const { data: posts } = await run(
    db
      .from('posts')
      .select('data')
      .eq('data->>type', 'date-doc')
      .eq('data->>creatorId', user.id)
  )
  if (posts && posts.length > 0) {
    return { user, post: posts[0].data as DateDoc }
  }
  return null
}
