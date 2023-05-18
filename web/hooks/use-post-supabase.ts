import { Post } from 'common/post'
import { useEffect, useState } from 'react'
import { getPost } from 'web/lib/supabase/post'
import { useSubscription } from 'web/lib/supabase/realtime/use-subscription'

export function useRealtimePost(postId?: string) {
  // mqp: the posts components are weird and it's hard to refactor them
  // in a way that only calls this hook when there's a real post to subscribe to
  const posts = useSubscription('posts', { k: 'id', v: postId ?? '_' })
  return posts != null && posts.length > 0 ? posts[0].data as Post : undefined
}

export function usePost(postId?: string) {
  const [post, setPost] = useState<Post | null>(null)
  useEffect(() => {
    if (postId) {
      getPost(postId).then((result) => {
        setPost(result)
      })
    }
  }, [postId])
  return post
}
