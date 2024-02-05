import clsx from 'clsx'
import { HeartIcon } from '@heroicons/react/outline'
import { useState } from 'react'

import { api } from 'web/lib/firebase/api'
import { Button, buttonClass } from 'web/components/buttons/button'
import { track } from 'web/lib/service/analytics'
import { Tooltip } from 'web/components/widgets/tooltip'
import { formatMoney } from 'common/util/format'
import { LIKE_COST } from 'common/love/constants'
import { Col } from 'web/components/layout/col'
import { MODAL_CLASS, Modal } from 'web/components/layout/modal'
import { Row } from 'web/components/layout/row'
import { Lover } from 'common/love/lover'
import { useUserById } from 'web/hooks/use-user-supabase'
import { MatchAvatars } from '../matches/match-avatars'
import { useLover } from 'love/hooks/use-lover'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { useUser } from 'web/hooks/use-user'

export const LikeButton = (props: {
  targetLover: Lover
  liked: boolean
  refresh: () => Promise<void>
  className?: string
}) => {
  const { targetLover, liked, refresh, className } = props
  const targetId = targetLover.user_id
  const [isLoading, setIsLoading] = useState(false)

  const { data, refresh: refreshHasFreeLike } = useAPIGetter(
    'has-free-like',
    {}
  )
  const hasFreeLike = data?.hasFreeLike ?? false

  const [showConfirmation, setShowConfirmation] = useState(false)

  const like = async () => {
    setShowConfirmation(false)
    setIsLoading(true)
    await api('like-lover', { targetUserId: targetId, remove: liked })
    track('like lover', {
      targetId,
      remove: liked,
    })
    await refresh()
    setIsLoading(false)
    await refreshHasFreeLike()
  }

  return (
    <Tooltip text={liked ? 'Unlike' : 'Send like'} noTap>
      <button
        disabled={isLoading}
        className={clsx(
          buttonClass('md', 'none'),
          'text-ink-500 disabled:text-ink-500 bg-canvas-0 active:bg-canvas-100 disabled:bg-canvas-100 border-ink-100 dark:border-ink-300 !rounded-full border shadow',
          isLoading && 'animate-pulse',
          className
        )}
        onClick={() => setShowConfirmation(true)}
      >
        <Col className="items-center">
          <HeartIcon
            className={clsx(
              'h-14 w-14',
              liked &&
                'fill-primary-400 stroke-primary-500 dark:stroke-primary-600'
            )}
          />
          <div className="p-2 pb-0 pt-0">
            {liked ? (
              <>Liked!</>
            ) : (
              <>{hasFreeLike ? 'Like' : formatMoney(LIKE_COST)}</>
            )}
          </div>
        </Col>
      </button>
      <LikeConfimationDialog
        targetLover={targetLover}
        hasFreeLike={hasFreeLike}
        submit={like}
        open={!liked && showConfirmation}
        setOpen={setShowConfirmation}
      />
      <CancelLikeConfimationDialog
        targetLover={targetLover}
        submit={like}
        open={liked && showConfirmation}
        setOpen={setShowConfirmation}
      />
    </Tooltip>
  )
}

const LikeConfimationDialog = (props: {
  targetLover: Lover
  hasFreeLike: boolean
  open: boolean
  setOpen: (open: boolean) => void
  submit: () => void
}) => {
  const { open, setOpen, targetLover, hasFreeLike, submit } = props
  const youLover = useLover()
  const user = useUserById(targetLover.user_id)
  const currentUser = useUser()

  return (
    <Modal
      open={open}
      className={clsx(
        MODAL_CLASS,
        'pointer-events-auto max-h-[32rem] overflow-auto'
      )}
    >
      <Col className="gap-4">
        <div className="text-xl">Like {user ? user.name : ''}?</div>

        <Col className="gap-2">
          <div className="text-ink-500">
            They will get a notification. Unlocks messaging them.
          </div>
          <div className="text-ink-500">(You get one free like per day.)</div>
        </Col>

        {youLover && user && (
          <MatchAvatars
            profileLover={youLover}
            matchedLover={{ ...targetLover, user }}
          />
        )}

        {!hasFreeLike && currentUser && (
          <div className="text-ink-500 mt-4 whitespace-nowrap text-sm">
            Balance{' '}
            <span className="text-ink-800">
              {formatMoney(currentUser.balance)}
            </span>
          </div>
        )}

        <Row className="mt-2 items-center justify-between">
          <Button color="gray-outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => submit()}
            disabled={!!user && user.balance < LIKE_COST}
          >
            {hasFreeLike ? (
              <>Use free like & submit</>
            ) : (
              <>Pay {formatMoney(LIKE_COST)} & submit</>
            )}
          </Button>
        </Row>
      </Col>
    </Modal>
  )
}

const CancelLikeConfimationDialog = (props: {
  targetLover: Lover
  open: boolean
  setOpen: (open: boolean) => void
  submit: () => void
}) => {
  const { open, setOpen, targetLover, submit } = props
  const user = useUserById(targetLover.user_id)
  return (
    <Modal
      open={open}
      setOpen={setOpen}
      className={clsx(
        MODAL_CLASS,
        'pointer-events-auto max-h-[32rem] overflow-auto'
      )}
    >
      <Col className="gap-4">
        <div className="text-xl">Remove like of {user ? user.name : ''}</div>

        <div className="text-ink-500">You will not be refunded the cost.</div>

        <Row className="mt-2 items-center justify-between">
          <Button color="gray-outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => submit()}>Remove like</Button>
        </Row>
      </Col>
    </Modal>
  )
}
