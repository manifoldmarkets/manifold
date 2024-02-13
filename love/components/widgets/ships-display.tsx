import { useState } from 'react'
import { orderBy, groupBy, max } from 'lodash'
import clsx from 'clsx'

import { MODAL_CLASS, Modal } from 'web/components/layout/modal'
import { MatchAvatars } from '../matches/match-avatars'
import { Row } from 'web/components/layout/row'
import { Lover } from 'common/love/lover'
import { useLoverByUserId } from 'love/hooks/use-lover'
import { Col } from 'web/components/layout/col'
import { EmptyAvatar, RawAvatar } from 'web/components/widgets/avatar'
import { Carousel } from 'web/components/widgets/carousel'
import { UserLink } from 'web/components/widgets/user-link'
import { useUser, useUserById } from 'web/hooks/use-user'
import { Subtitle } from './lover-subtitle'
import { ShipButton } from './ship-button'
import { hasShipped } from 'love/lib/util/ship-util'
import { ShipData } from 'common/api/love-types'

export const ShipsList = (props: {
  label: string
  ships: ShipData[]
  profileLover: Lover
  refreshShips: () => Promise<void>
}) => {
  const { label, ships, profileLover, refreshShips } = props

  const shipsWithTargetId = ships.map(
    ({ target1_id, target2_id, ...other }) => ({
      ...other,
      target1_id,
      target2_id,
      targetId: target1_id === profileLover.user_id ? target2_id : target1_id,
    })
  )
  const shipsByTargetId = groupBy(shipsWithTargetId, (s) => s.targetId)
  const sortedTargetIds = orderBy(
    Object.keys(shipsByTargetId),
    (targetId) => max(shipsByTargetId[targetId].map((s) => s.created_time)),
    'desc'
  )

  return (
    <Col className="gap-1">
      <Subtitle>{label}</Subtitle>
      {sortedTargetIds.length > 0 ? (
        <Carousel className="w-full" labelsParentClassName="gap-0">
          {sortedTargetIds.map((targetId) => {
            return (
              <ShipsTargetDisplay
                key={targetId}
                ships={shipsByTargetId[targetId]}
                profileLover={profileLover}
                refreshShips={refreshShips}
              />
            )
          })}
        </Carousel>
      ) : (
        <div className="text-ink-500">None</div>
      )}
    </Col>
  )
}

const ShipsTargetDisplay = (props: {
  ships: (ShipData & { targetId: string })[]
  refreshShips: () => Promise<void>
  profileLover: Lover
  className?: string
}) => {
  const { ships, refreshShips, profileLover, className } = props
  const { targetId } = ships[0]

  const targetLover = useLoverByUserId(targetId)
  const targetUser = useUserById(targetId)
  const [open, setOpen] = useState(false)

  const currentUser = useUser()
  const shipped = hasShipped(currentUser, profileLover.user_id, targetId, ships)

  return (
    <>
      <button
        className={clsx(className, 'group flex flex-col items-center gap-1')}
        onClick={() => setOpen(!open)}
      >
        <UserAvatar className="-ml-1 first:ml-0" userId={targetId} />
        <div className="text-ink-500 group-hover:underline group-active:underline">
          x {ships.length}
        </div>
      </button>

      {open && (
        <Modal open={open} setOpen={setOpen}>
          <Col className={clsx(MODAL_CLASS, 'relative')}>
            {targetLover && targetUser && (
              <>
                <MatchAvatars
                  profileLover={profileLover}
                  matchedLover={{ ...targetLover, user: targetUser }}
                />
                <Row className="w-full items-baseline justify-stretch gap-2 text-lg font-semibold">
                  <Row className="flex-1 justify-end">
                    <UserLink hideBadge userId={profileLover.user.id} noLink />
                  </Row>
                  &
                  <Row className="flex-1 justify-start">
                    <UserLink hideBadge userId={targetUser.id} />
                  </Row>
                </Row>
              </>
            )}
            <Col className="gap-2 self-start">
              <div className="text-ink-600 text-lg font-semibold">
                Shipping them ({ships.length})
              </div>
              <Col className="gap-2">
                {ships.map((ship) => (
                  <UserInfoRow key={ship.creator_id} userId={ship.creator_id} />
                ))}
              </Col>
            </Col>
            {currentUser &&
              profileLover.user_id !== currentUser?.id &&
              targetId !== currentUser?.id && (
                <Row className="sticky bottom-[70px] right-0 mr-1 self-end lg:bottom-6">
                  <ShipButton
                    shipped={shipped}
                    targetId1={profileLover.user_id}
                    targetId2={targetId}
                    refresh={refreshShips}
                  />
                </Row>
              )}
          </Col>
        </Modal>
      )}
    </>
  )
}

const UserAvatar = (props: { userId: string; className?: string }) => {
  const { userId, className } = props
  const lover = useLoverByUserId(userId)
  const user = useUserById(userId)

  if (!lover || !lover.pinned_url)
    return <EmptyAvatar className={className} size={10} />
  return (
    <RawAvatar
      className={className}
      avatarUrl={lover.pinned_url}
      username={user?.username}
      noLink
    />
  )
}

const UserInfoRow = (props: { userId: string; className?: string }) => {
  const { userId, className } = props
  const user = useUserById(userId)
  const lover = useLoverByUserId(userId)

  return (
    <Row className={clsx(className, 'items-center gap-2')}>
      {!lover || !lover.pinned_url ? (
        <EmptyAvatar size={10} />
      ) : (
        <RawAvatar avatarUrl={lover.pinned_url} username={user?.username} />
      )}
      {user && <UserLink userId={userId} hideBadge />}
    </Row>
  )
}
