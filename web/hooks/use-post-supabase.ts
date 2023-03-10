import { Post } from 'common/post'
import { useEffect, useState } from 'react'
import { db } from 'web/lib/supabase/db'
import { getPost } from 'web/lib/supabase/post'

export function useRealtimePost(postId: string) {
  const [post, setPost] = useState<Post | null>(null)
  function fetchPost() {
    getPost(postId)
      .then((result) => {
        setPost(result)
      })
      .catch((e) => console.log(e))
  }

  useEffect(() => {
    fetchPost()
  }, [])

  useEffect(() => {
    const channel = db.channel('post-realtime')
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'groups',
        filter: `id=eq.${postId}`,
      },
      (payload) => {
        fetchPost()
      }
    )
    channel.subscribe(async (status) => {})
    return () => {
      db.removeChannel(channel)
    }
  }, [db])
  return post
}
