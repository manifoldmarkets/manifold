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

export const usePosts = (postIds: string[]) => {
  const [posts, setPosts] = useState<Post[]>([])
  useEffect(() => {
    if (postIds.length === 0) return
    setPosts([])

    const unsubscribes = postIds.map((postId) =>
      listenForPost(postId, (post) => {
        if (post) {
          setPosts((posts) => [...posts, post])
        }
      })
    )

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe())
    }
  }, [postIds])

  return posts
    .filter(
      (post, index, self) => index === self.findIndex((t) => t.id === post.id)
    )
    .sort((a, b) => b.createdTime - a.createdTime)
}
