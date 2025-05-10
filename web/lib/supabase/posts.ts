import { run } from 'common/supabase/utils'

import { convertPost, TopLevelPost } from 'common/top-level-post'
import { useState } from 'react'
import { useEffect } from 'react'
import { db } from './db'
import { api } from '../api/api'

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
    api('get-posts', { sortBy: 'created_time' }).then(setLatestPosts)
  }, [])
  return latestPosts
}
