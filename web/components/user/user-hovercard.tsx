import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  safePolygon,
  shift,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useRole,
} from '@floating-ui/react'
import clsx from 'clsx'
import { FullUser } from 'common/api/user-types'
import { userHasHovercardGlow } from 'common/shop/items'
import dayjs from 'dayjs'
import { Ref, forwardRef, useEffect, useState } from 'react'
import { SimpleCopyTextButton } from 'web/components/buttons/copy-link-button'
import { useAdminOrMod } from 'web/hooks/use-admin'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { useFollowers, useFollows } from 'web/hooks/use-follows'
import { getFullUserById } from 'web/lib/supabase/users'
import { FollowButton } from '../buttons/follow-button'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import SuperBanControl from '../SuperBanControl'
import { Avatar } from '../widgets/avatar'
import { Linkify } from '../widgets/linkify'
import { StackedUserNames } from '../widgets/user-link'

export type UserHovercardProps = {
  children: React.ReactNode
  userId: string
  className?: string | undefined
}

function formatLastActive(lastActiveTime: number) {
  if (lastActiveTime === 0) return 'Never'

  const now = dayjs()
  const lastActiveDate = dayjs(lastActiveTime)
  const days = now.diff(lastActiveDate, 'day')

  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days <= 7) return `${days} days ago`
  if (days <= 30) {
    const weeks = Math.floor(days / 7)
    if (weeks === 1) return '1 week ago'
    return `${weeks} weeks ago`
  }
  if (days <= 365) {
    const months = Math.floor(days / 30)
    if (months === 1) return '1 month ago'
    if (months <= 12) return `${months} months ago`
    return 'in the last year'
  }
  return 'over a year'
}

export function UserHovercard({
  children,
  userId,
  className,
}: UserHovercardProps) {
  const [open, setOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: (newOpen) => {
      // Don't close while modal is open
      if (!newOpen && modalOpen) return
      setOpen(newOpen)
    },
    whileElementsMounted: autoUpdate,
    placement: 'bottom-start',
    middleware: [offset(8), flip(), shift({ padding: 4 })],
    strategy: 'fixed',
  })

  const { getReferenceProps, getFloatingProps } = useInteractions([
    useHover(context, {
      delay: { open: 150, close: 300 },
      handleClose: safePolygon({ buffer: -0.5 }),
      enabled: !modalOpen,
    }),
    useFocus(context),
    useDismiss(context, { enabled: !modalOpen }),
    useRole(context, { role: 'dialog' }),
  ])

  return (
    <>
      <button
        ref={refs.setReference}
        className={clsx('inline-flex', className)}
        {...getReferenceProps()}
      >
        {children}
      </button>
      {open && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            className="fixed"
            style={floatingStyles}
            {...getFloatingProps()}
          >
            <FetchUserHovercardContent
              userId={userId}
              onModalOpenChange={setModalOpen}
            />
          </div>
        </FloatingPortal>
      )}
    </>
  )
}

const FetchUserHovercardContent = forwardRef(
  (
    {
      userId,
      onModalOpenChange,
    }: { userId: string; onModalOpenChange?: (open: boolean) => void },
    ref: Ref<HTMLDivElement>
  ) => {
    const [user, setUser] = useState<FullUser | null>(null)

    useEffect(() => {
      getFullUserById(userId).then(setUser)
    }, [])

    const followingIds = useFollows(userId)
    const followerIds = useFollowers(userId)
    const isMod = useAdminOrMod()
    const { data: lastActiveData } = useAPIGetter('get-user-last-active-time', {
      userId,
    })
    const lastActiveTime = Math.max(
      lastActiveData?.lastActiveTime ?? 0,
      user?.lastBetTime ?? 0
    )

    const hasGlow = userHasHovercardGlow(user?.entitlements)

    return user ? (
      <div
        ref={ref}
        className={clsx(
          'animate-slide-up-and-fade divide-ink-300 bg-canvas-0 text-ink-1000 z-30 w-56 divide-y rounded-md shadow-lg focus:outline-none',
          hasGlow
            ? 'shadow-[0_0_15px_rgba(167,139,250,0.5)] ring-2 ring-violet-400'
            : 'ring-ink-1000 ring-1 ring-opacity-5'
        )}
      >
        <div className="px-4 py-3">
          <Row className="items-start justify-between">
            <div className="group">
              <Avatar
                username={user.username}
                avatarUrl={user.avatarUrl}
                size="lg"
                entitlements={user.entitlements}
                displayContext="hovercard"
              />
            </div>
            <FollowButton userId={userId} size="xs" />
          </Row>

          <StackedUserNames
            usernameClassName={'text-base'}
            className={'text-lg font-bold'}
            user={user}
            followsYou={false}
            displayContext="hovercard"
          />

          {user.bio && (
            <div className="sm:text-md mt-1 line-clamp-5 text-sm">
              <Linkify text={user.bio}></Linkify>
            </div>
          )}

          <Col className="mt-3 gap-1">
            <Row className="gap-4 text-sm">
              <div>
                <span className="font-semibold">
                  {followingIds?.length ?? ''}
                </span>{' '}
                Following
              </div>
              <div>
                <span className="font-semibold">
                  {followerIds?.length ?? ''}
                </span>{' '}
                Followers
              </div>
            </Row>

            <Row className="gap-4 text-sm">
              <div className="text-ink-400">
                Joined {dayjs(user.createdTime).format('MMM DD, YYYY')}
              </div>
              {isMod && (
                <SimpleCopyTextButton
                  text={user.id}
                  tooltip="Copy user id"
                  className="!px-1 !py-px"
                  eventTrackingName={'admin copy user id'}
                />
              )}
            </Row>
          </Col>
        </div>

        <div className="py-1">
          <Row className="items-center justify-between px-4 py-2">
            <div className="text-ink-700 text-sm">
              <span className="font-semibold">Last active:</span>{' '}
              {formatLastActive(lastActiveTime)}
            </div>
            {isMod && (
              <SuperBanControl
                userId={userId}
                onModalOpenChange={onModalOpenChange}
              />
            )}
          </Row>
        </div>
      </div>
    ) : null
  }
)
