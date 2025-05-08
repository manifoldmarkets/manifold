import { run } from 'common/supabase/utils'

import { convertPost, TopLevelPost } from 'common/top-level-post'
import { useState } from 'react'
import { useEffect } from 'react'
import { db } from './db'

export async function getAllPosts(
  sortBy: 'created_time' | 'importance_score' = 'created_time'
) {
  const { data } = await run(
    db
      .from('old_posts')
      .select()
      .eq('visibility', 'public')
      .order(sortBy, { ascending: false } as any)
      .limit(100)
  )
  return data.map(convertPost)
}

export async function getPostsByUser(userId: string) {
  const { data } = await run(
    db
      .from('old_posts')
      .select()
      .eq('creator_id', userId)
      .order('created_time', { ascending: false } as any)
  )
  return data.map(convertPost)
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

export const useLatestPosts = () => {
  const [latestPosts, setLatestPosts] = useState<TopLevelPost[]>([])
  useEffect(() => {
    getAllPosts('created_time').then(setLatestPosts)
  }, [])
  return latestPosts
}
