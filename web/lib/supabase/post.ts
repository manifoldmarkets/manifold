import { DateDoc, Post } from 'common/post'
import { Row, run } from 'common/supabase/utils'
import { db } from './db'
import { getUserByUsername } from 'web/lib/supabase/users'
import { mapTypes } from 'common/util/types'

export function postPath(postSlug: string) {
  return `/post/${postSlug}`
}

export async function getPost(postId: string) {
  const { data } = await run(db.from('posts').select().eq('id', postId))
  if (data && data.length > 0) {
    return convertPost(data[0])
  }
  return null
}

export async function getPostBySlug(slug: string) {
  const { data } = await run(db.from('posts').select().eq('data->>slug', slug))
  if (data && data.length > 0) {
    return convertPost(data[0])
  }
  return null
}

export async function getAllPosts() {
  const { data } = await run(
    db
      .from('posts')
      .select()
      .order('created_time', { ascending: false } as any)
  )
  return data.map(convertPost)
}

export async function getPostsByGroup(groupId: string) {
  const { data } = await run(db.from('posts').select().eq('group_id', groupId))
  return data.map(convertPost)
}

export async function getPostsByUser(userId: string) {
  const { data } = await run(
    db
      .from('posts')
      .select()
      .eq('creator_id', userId)
      .order('created_time', { ascending: false } as any)
  )
  return data.map(convertPost)
}

export async function getDateDocs() {
  const { data } = await run(
    db
      .from('posts')
      .select()
      .eq('data->>type', 'date-doc')
      .order('created_time', { ascending: false } as any)
  )
  return data.map(convertPost) as DateDoc[]
}

export async function getDateDoc(username: string) {
  const user = await getUserByUsername(username)

  if (!user) return null

  const { data } = await run(
    db
      .from('posts')
      .select()
      .eq('data->>type', 'date-doc')
      .eq('data->>creatorId', user.id)
  )
  if (data && data.length > 0) {
    return { user, post: convertPost(data[0]) as DateDoc }
  }
  return null
}

const convertPost = (sqlPost: Row<'posts'>) =>
  mapTypes<'posts', Post>(sqlPost, {
    fs_updated_time: false,
    created_time: false, // grab from data
  })
