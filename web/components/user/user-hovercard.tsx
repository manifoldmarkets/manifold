import { Row } from '../layout/row'
import { Ref, forwardRef, useEffect, useState } from 'react'
import { getFullUserById } from 'web/lib/supabase/users'
import { useFollowers, useFollows } from 'web/hooks/use-follows'
import { useAdminOrMod } from 'web/hooks/use-admin'
import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react'
import { Avatar } from '../widgets/avatar'
import { FollowButton } from '../buttons/follow-button'
import { StackedUserNames } from '../widgets/user-link'
import { Linkify } from '../widgets/linkify'
import { RelativeTimestampNoTooltip } from '../relative-timestamp'
import dayjs from 'dayjs'
import { Col } from '../layout/col'
import { FullUser } from 'common/api/user-types'
import { TRADE_TERM } from 'common/envs/constants'
import { SimpleCopyTextButton } from 'web/components/buttons/copy-link-button'

export type UserHovercardProps = {
  children: React.ReactNode
  userId: string
  className?: string
}

export function UserHovercard({
  children,
  userId,
  className,
}: UserHovercardProps) {
  return (
    <Popover className={className} data-hover>
      <PopoverButton as="div" className="inline-flex">
        {children}
      </PopoverButton>

      <PopoverPanel anchor="bottom start">
        <FetchUserHovercardContent userId={userId} />
      </PopoverPanel>
    </Popover>
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

    return user ? (
      <div
        ref={ref}
        className="animate-slide-up-and-fade bg-canvas-0 ring-ink-1000 divide-ink-300 z-30 mt-2 w-56 divide-y rounded-md shadow-lg ring-1 ring-opacity-5 focus:outline-none"
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

        {isMod && (
          <div className="py-1">
            <div className="block px-4 py-2 text-sm text-gray-700">
              <span className="font-semibold">Last {TRADE_TERM}:</span>{' '}
              {user.lastBetTime ? (
                <RelativeTimestampNoTooltip
                  time={user.lastBetTime}
                  className="text-ink-700"
                />
              ) : (
                'Never'
              )}
            </div>
          </div>
        )}
      </div>
    ) : null
  }
)
