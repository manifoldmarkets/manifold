import { useEffect, useState } from 'react'
import { Post } from 'common/post'
import { getPostsByUser } from 'web/lib/supabase/post'
import { useIsAuthorized } from './use-user'

export const usePostsByUser = (userId: string) => {
  const [posts, setPosts] = useState<Post[]>([])
  const isAuth = useIsAuthorized()

  useEffect(() => {
    getPostsByUser(userId).then(setPosts)
  }, [userId, isAuth])

  return posts
}
