import { BookmarkIcon } from '@heroicons/react/outline'
import { BookmarkIcon as FilledBookmarkIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { useState } from 'react'
import { Group } from 'common/group'
import { TOPIC_IDS_YOU_CANT_FOLLOW } from 'common/supabase/groups'
import { removeEmojis } from 'common/util/string'
import {
  internalFollowTopic,
  internalUnfollowTopic,
} from 'web/components/topics/topics-button'
import { useIsFollowingTopic } from 'web/hooks/use-group-supabase'
import { useUser } from 'web/hooks/use-user'

/**
 * Follow the topic behind a sports page, so its markets show on the home
 * feed. Signed-out visitors get the sign-in prompt. Icon-only on phones,
 * where the heading needs the room.
 */
export function SportFollowButton(props: { topic: Group }) {
  const { topic } = props
  const user = useUser()
  const { isFollowing, setIsFollowing } = useIsFollowingTopic(topic.slug)
  const [loading, setLoading] = useState(false)
  if (TOPIC_IDS_YOU_CANT_FOLLOW.includes(topic.id)) return null

  const name = removeEmojis(topic.name).trim() || topic.name
  const label = isFollowing ? 'Following' : 'Follow'
  return (
    <button
      type="button"
      aria-pressed={!!isFollowing}
      aria-label={isFollowing ? `Unfollow ${name}` : `Follow ${name}`}
      title={isFollowing ? `Unfollow ${name}` : `Follow ${name}`}
      disabled={loading || (!!user && isFollowing === undefined)}
      onClick={async () => {
        setLoading(true)
        try {
          // Only once it went through: a failure leaves the button as it was.
          if (isFollowing) {
            if (await internalUnfollowTopic(user, topic)) setIsFollowing(false)
          } else {
            if (await internalFollowTopic(user, topic)) setIsFollowing(true)
          }
        } finally {
          setLoading(false)
        }
      }}
      className={clsx(
        'flex min-h-[40px] min-w-[40px] shrink-0 items-center justify-center gap-1 rounded-md border px-2.5 text-sm font-medium transition-colors disabled:opacity-60 sm:px-3',
        isFollowing
          ? 'border-primary-300 bg-primary-50 text-primary-700 hover:bg-primary-100'
          : 'border-ink-200 bg-canvas-0 text-ink-700 hover:bg-canvas-50'
      )}
    >
      {isFollowing ? (
        <FilledBookmarkIcon className="h-4 w-4" />
      ) : (
        <BookmarkIcon className="h-4 w-4" />
      )}
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}
