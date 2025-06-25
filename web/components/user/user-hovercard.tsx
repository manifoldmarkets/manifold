import { Row } from '../layout/row'
import { Ref, forwardRef, useEffect, useState } from 'react'
import { getFullUserById } from 'web/lib/supabase/users'
import { useFollowers, useFollows } from 'web/hooks/use-follows'
import { useAdminOrMod } from 'web/hooks/use-admin'
import { Avatar } from '../widgets/avatar'
import { FollowButton } from '../buttons/follow-button'
import { StackedUserNames } from '../widgets/user-link'
import { Linkify } from '../widgets/linkify'
import { RelativeTimestampNoTooltip } from '../relative-timestamp'
import dayjs from 'dayjs'
import { Col } from '../layout/col'
import { FullUser } from 'common/api/user-types'
import { SimpleCopyTextButton } from 'web/components/buttons/copy-link-button'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import {
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
  FloatingPortal,
} from '@floating-ui/react'
import clsx from 'clsx'

export type UserHovercardProps = {
  children: React.ReactNode
  userId: string
  className?: string | undefined
}

export function UserHovercard({
  children,
  userId,
  className,
}: UserHovercardProps) {
  const [open, setOpen] = useState(false)

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    whileElementsMounted: autoUpdate,
    placement: 'bottom-start',
    middleware: [offset(8), flip(), shift({ padding: 4 })],
    strategy: 'fixed',
  })

  const { getReferenceProps, getFloatingProps } = useInteractions([
    useHover(context, {
      delay: { open: 150, close: 300 },
      handleClose: safePolygon({ buffer: -0.5 }),
    }),
    useFocus(context),
    useDismiss(context),
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
            <FetchUserHovercardContent userId={userId} />
          </div>
        </FloatingPortal>
      )}
    </>
  )
}

const FetchUserHovercardContent = forwardRef(
  ({ userId }: { userId: string }, ref: Ref<HTMLDivElement>) => {
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

    return user ? (
      <div
        ref={ref}
        className="animate-slide-up-and-fade ring-ink-1000 divide-ink-300 bg-canvas-0 text-ink-1000 z-30 w-56 divide-y rounded-md shadow-lg ring-1 ring-opacity-5 focus:outline-none"
      >
        <div className="px-4 py-3">
          <Row className="items-start justify-between">
            <Avatar
              username={user.username}
              avatarUrl={user.avatarUrl}
              size="lg"
            />
            <FollowButton userId={userId} size="xs" />
          </Row>

          <StackedUserNames
            usernameClassName={'text-base'}
            className={'text-lg font-bold'}
            user={user}
            followsYou={false}
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
          <div className="text-ink-700 block px-4 py-2 text-sm">
            <span className="font-semibold">Last active:</span>{' '}
            {lastActiveTime !== 0 ? (
              <RelativeTimestampNoTooltip
                time={lastActiveTime}
                className="text-ink-700"
              />
            ) : (
              'Never'
            )}
          </div>
        </div>
      </div>
    ) : null
  }
)
