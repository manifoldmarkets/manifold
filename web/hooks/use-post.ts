import { useEffect, useState } from 'react'
import { Post } from 'common/post'
import { listenForPost } from 'web/lib/firebase/posts'

export const usePost = (postId: string | undefined) => {
  const [post, setPost] = useState<Post | null | undefined>()

  useEffect(() => {
    if (postId) return listenForPost(postId, setPost)
  }, [postId])

  return post
}
