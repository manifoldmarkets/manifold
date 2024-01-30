import clsx from 'clsx'
import { StarIcon } from '@heroicons/react/outline'
import { useState } from 'react'

import { api } from 'web/lib/firebase/api'
import { buttonClass } from 'web/components/buttons/button'
import { track } from 'web/lib/service/analytics'
import { Tooltip } from 'web/components/widgets/tooltip'
import { Lover } from 'common/love/lover'

export const StarButton = (props: {
  targetLover: Lover
  isStarred: boolean
  refresh: () => Promise<void>
  hideTooltip?: boolean
  className?: string
}) => {
  const { targetLover, isStarred, refresh, hideTooltip, className } = props
  const targetId = targetLover.user_id
  const [isLoading, setIsLoading] = useState(false)

  const star = async () => {
    setIsLoading(true)
    await api('star-lover', { targetUserId: targetId, remove: isStarred })
    track('star lover', {
      targetId,
      remove: isStarred,
    })
    await refresh()
    setIsLoading(false)
  }

  const button = (
    <button
      disabled={isLoading}
      className={clsx(
        buttonClass('xs', 'none'),
        'text-ink-500 disabled:text-ink-500 active:bg-canvas-100 disabled:bg-canvas-100 !rounded-full disabled:cursor-not-allowed',
        className
      )}
      onClick={(e) => {
        e.preventDefault()
        star()
      }}
    >
      <StarIcon
        className={clsx(
          'h-10 w-10',
          isStarred &&
            'fill-yellow-400 stroke-yellow-500 dark:stroke-yellow-600'
        )}
      />
    </button>
  )

  if (hideTooltip) return button

  return (
    <Tooltip text={isStarred ? 'Remove star' : 'Add star'} noTap>
      {button}
    </Tooltip>
  )
}
