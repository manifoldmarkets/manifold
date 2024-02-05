import clsx from 'clsx'
import { useState } from 'react'
import { HeartIcon } from '@heroicons/react/outline'

import { api } from 'web/lib/firebase/api'
import { baseButtonClasses } from 'web/components/buttons/button'
import { track } from 'web/lib/service/analytics'
import { Tooltip } from 'web/components/widgets/tooltip'
import { Col } from 'web/components/layout/col'

export const ShipButton = (props: {
  targetId1: string
  targetId2: string
  shipped: boolean
  refresh: () => Promise<void>
  className?: string
}) => {
  const { targetId1, targetId2, shipped, refresh, className } = props
  const [isLoading, setIsLoading] = useState(false)

  const like = async () => {
    setIsLoading(true)
    await api('ship-lovers', {
      targetUserId1: targetId1,
      targetUserId2: targetId2,
      remove: shipped,
    })
    track('ship lovers', {
      targetId1,
      targetId2,
      remove: shipped,
    })
    await refresh()
    setIsLoading(false)
  }

  return (
    <Tooltip text={shipped ? 'Undo ship' : 'Ship this match'} noTap>
      <button
        disabled={isLoading}
        className={clsx(
          baseButtonClasses,
          'p-2 text-sm',
          'text-ink-500 disabled:text-ink-500 bg-canvas-0 active:bg-canvas-100 disabled:bg-canvas-100 border-ink-100 dark:border-ink-300 !rounded-full border shadow disabled:cursor-not-allowed',
          className
        )}
        onClick={like}
      >
        <Col className="items-center gap-1">
          <HeartIcon
            className={clsx(
              'h-12 w-12',
              shipped &&
                'fill-primary-400 stroke-primary-500 dark:stroke-primary-600'
            )}
          />
          <div className="p-3 pb-2 pt-0 text-xs">
            {shipped ? 'Shipping!' : 'Ship them!'}
          </div>
        </Col>
      </button>
    </Tooltip>
  )
}
