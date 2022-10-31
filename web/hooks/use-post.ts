import { useEffect, useState } from 'react'
import { DateDoc, Post } from 'common/post'
import {
  getAllPosts,
  getPostsByUser,
  listenForDateDocs,
  listenForPost,
} from 'web/lib/firebase/posts'
import { useEffectCheckEquality } from './use-effect-check-equality'
import { inMemoryStore, usePersistentState } from './use-persistent-state'

export const usePost = (postId: string | undefined) => {
  const [post, setPost] = useState<Post | null | undefined>()

  useEffect(() => {
    if (postId) return listenForPost(postId, setPost)
  }, [postId])

  return post
}

export const usePosts = (postIds: string[]) => {
  const [posts, setPosts] = useState<Post[]>([])
  useEffectCheckEquality(() => {
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

export const useAllPosts = (excludeAboutPosts?: boolean, limit?: number) => {
  const [posts, setPosts] = usePersistentState<Post[]>([], {
    key: 'all-posts',
    store: inMemoryStore(),
  })

  useEffect(() => {
    getAllPosts().then(setPosts)
  }, [setPosts])

  return posts
    .filter((post) => (excludeAboutPosts ? !post.isGroupAboutPost : true))
    .sort((a, b) => b.createdTime - a.createdTime)
    .slice(0, limit)
}

export const useDateDocs = () => {
  const [dateDocs, setDateDocs] = useState<DateDoc[]>()

  useEffect(() => {
    return listenForDateDocs(setDateDocs)
  }, [])

  return dateDocs
}

export const usePostsByUser = (userId: string) => {
  const [posts, setPosts] = useState<Post[] | null>(null)

  useEffect(() => {
    getPostsByUser(userId).then(setPosts)
  }, [userId])

  return posts?.sort((a, b) => b.createdTime - a.createdTime)
}
