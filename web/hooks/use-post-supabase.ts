import { Group } from 'common/group'
import { Post } from 'common/post'
import { useEffect, useState } from 'react'
import { db } from 'web/lib/supabase/db'
import { getPost } from 'web/lib/supabase/post'

export function useRealtimePost(postId?: string) {
  const [post, setPost] = useState<Post | null>(null)
  function fetchPost() {
    if (postId) {
      getPost(postId)
        .then((result) => {
          setPost(result)
        })
        .catch((e) => console.log(e))
    }
  }

  useEffect(() => {
    fetchPost()
  }, [postId])

  useEffect(() => {
    if (postId) {
      const channel = db.channel('post-realtime')
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'posts',
          filter: `id=eq.${postId}`,
        },
        (payload) => {
          console.log(payload)
          if (payload.eventType === 'UPDATE') {
            setPost(payload.new.data)
          }
          if (payload.eventType === 'DELETE') {
            setPost(null)
          }
        }
      )
      channel.subscribe(async (status) => {})
      return () => {
        db.removeChannel(channel)
      }
    }
  }, [db, postId])
  return post
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
