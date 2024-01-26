import clsx from 'clsx'
import { HeartIcon } from '@heroicons/react/outline'
import { useState } from 'react'

import { api } from 'web/lib/firebase/api'
import { buttonClass } from 'web/components/buttons/button'
import { track } from 'web/lib/service/analytics'
import { Tooltip } from 'web/components/widgets/tooltip'
import { formatMoney } from 'common/util/format'
import { LIKE_COST } from 'common/love/constants'
import { Col } from 'web/components/layout/col'

export const LikeButton = (props: {
  targetId: string
  liked: boolean
  refresh: () => Promise<void>
  className?: string
}) => {
  const { targetId, liked, refresh, className } = props
  const [isLoading, setIsLoading] = useState(false)

  const like = async () => {
    setIsLoading(true)
    await api('like-lover', { targetUserId: targetId, remove: liked })
    track('like lover', {
      targetId,
      remove: liked,
    })
    await refresh()
    setIsLoading(false)
  }

  return (
    <Tooltip text={liked ? 'Unlike' : 'Send like'} noTap>
      <button
        disabled={isLoading}
        className={clsx(
          buttonClass('md', 'none'),
          'text-ink-500 disabled:text-ink-500 bg-canvas-0 active:bg-canvas-100 disabled:bg-canvas-100 border-ink-100 dark:border-ink-300 !rounded-full border shadow disabled:cursor-not-allowed',
          className
        )}
        onClick={like}
      >
        <Col className="items-center">
          <HeartIcon
            className={clsx(
              'h-14 w-14',
              liked &&
                'fill-primary-400 stroke-primary-500 dark:stroke-primary-600'
            )}
          />
          <div className="p-2 pt-0">
            {liked ? <>Liked!</> : <>Cost {formatMoney(LIKE_COST)}</>}
          </div>
        </Col>
      </button>
    </Tooltip>
  )
}
