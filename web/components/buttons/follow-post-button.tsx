import { BookmarkIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { User } from 'common/user'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Button, IconButton } from 'web/components/buttons/button'
import { Row } from 'web/components/layout/row'
import { TopLevelPost } from 'common/top-level-post'
import { firebaseLogin } from 'web/lib/firebase/users'
import { track } from 'web/lib/service/analytics'
import { db } from 'web/lib/supabase/db'
import { api } from 'web/lib/api/api'
import { BookmarkIcon as FilledBookmarkIcon } from '@heroicons/react/solid'

export const FollowPostButton = (props: {
  post: TopLevelPost
  user: User | undefined | null
  className?: string
}) => {
  const { post, user, className } = props
  const { following, setFollowing } = useIsFollowingPost(post, user)

  return (
    <Button
      size="sm"
      color={'gray-outline'}
      className={className}
      onClick={async () => {
        if (!user) return firebaseLogin()
        if (following) {
          unfollowPost(post.id, post.slug).then(() => setFollowing(false))
        } else {
          followPost(post.id, post.slug).then(() => setFollowing(true))
        }
      }}
    >
      {following ? (
        <Row className={'items-center gap-x-2'}>
          <FilledBookmarkIcon className={clsx('h-5 w-5')} aria-hidden="true" />
          Unfollow
        </Row>
      ) : (
        <Row className={'items-center gap-x-2'}>
          <BookmarkIcon className={clsx('h-5 w-5')} aria-hidden="true" />
          Follow
        </Row>
      )}
    </Button>
  )
}

export const FollowPostIconButton = (props: {
  post: TopLevelPost
  user: User | undefined | null
  className?: string
}) => {
  const { post, user, className } = props
  const { following, setFollowing } = useIsFollowingPost(post, user)

  return (
    <IconButton
      size="xs"
      className={className}
      onClick={async () => {
        if (!user) return firebaseLogin()
        if (following) {
          unfollowPost(post.id, post.slug).then(() => setFollowing(false))
        } else {
          followPost(post.id, post.slug).then(() => setFollowing(true))
        }
      }}
    >
      {following ? (
        <FilledBookmarkIcon className={clsx('h-5 w-5')} aria-hidden="true" />
      ) : (
        <BookmarkIcon
          strokeWidth={2.5}
          className={clsx('h-5 w-5')}
          aria-hidden="true"
        />
      )}
    </IconButton>
  )
}

const useIsFollowingPost = (
  post: TopLevelPost,
  user: User | undefined | null
) => {
  const [following, setFollowing] = useState(false)

  useEffect(() => {
    if (!user) return
    // Check initial follow status
    db.from('post_follows')
      .select('post_id')
      .eq('user_id', user.id)
      .eq('post_id', post.id)
      .then((res) => {
        setFollowing((res.data?.length ?? 0) > 0)
      })
  }, [user?.id, post.id]) // Add any other relevant dependencies if needed, e.g., a timestamp that updates when a follow action occurs

  // Add useApiSubscription here if real-time updates are desired later
  // Similar to how contract_follows works with `contract-follow/${contract.id}` topic

  return { following, setFollowing }
}

export async function unfollowPost(postId: string, postSlug: string) {
  // Ensure the API endpoint name matches what we'll create
  await toast.promise(api('follow-post', { postId, follow: false }), {
    loading: 'Unfollowing post...',
    success: `You'll no longer be notified of new comments!`,
    error: 'Failed to unfollow post',
  })
  track('Unfollow Post', {
    slug: postSlug,
    postId,
  })
}

export async function followPost(postId: string, postSlug: string) {
  // Ensure the API endpoint name matches what we'll create
  await toast.promise(api('follow-post', { postId, follow: true }), {
    loading: 'Following post...',
    success: `You'll be notified of new comments!`,
    error: 'Failed to follow post',
  })
  track('Follow Post', {
    slug: postSlug,
    postId,
  })
}
