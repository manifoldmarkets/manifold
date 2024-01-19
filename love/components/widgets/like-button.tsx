import clsx from 'clsx'
import { HeartIcon } from '@heroicons/react/outline'

import { api } from 'web/lib/firebase/api'
import { Button } from 'web/components/buttons/button'
import { track } from 'web/lib/service/analytics'
import { Tooltip } from 'web/components/widgets/tooltip'

export const LikeButton = (props: {
  targetId: string
  liked: boolean
  refresh: () => void
  className?: string
}) => {
  const { targetId, liked, refresh, className } = props
  const like = async () => {
    await api('like-lover', { targetUserId: targetId, remove: liked })
    refresh()
    track('like lover', {
      targetId,
      remove: liked,
    })
  }

  return (
    <Tooltip text={liked ? 'Unlike' : 'Send like'} noTap>
      <Button
        color={'gray-white'}
        disabled={false}
        size="xs"
        className={clsx(
          'text-ink-500 disabled:text-ink-500 disabled:cursor-not-allowed',
          className
        )}
        onClick={like}
      >
        <HeartIcon
          className={clsx(
            'h-8 w-8',
            liked &&
              'fill-primary-300 stroke-primary-400 dark:stroke-primary-600'
          )}
        />
      </Button>
    </Tooltip>
  )
}
