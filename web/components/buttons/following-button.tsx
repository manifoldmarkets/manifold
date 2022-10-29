import clsx from 'clsx'

import { User } from 'common/user'
import { useState } from 'react'
import { useFollowers, useFollows } from 'web/hooks/use-follows'
import { usePrefetchUsers, useUser } from 'web/hooks/use-user'
import { FollowList } from '../follow-list'
import { Col } from '../layout/col'
import { Modal } from '../layout/modal'
import { Tabs } from '../layout/tabs'
import { useDiscoverUsers } from 'web/hooks/use-users'
import { TextButton } from './text-button'

export function FollowingButton(props: { user: User; className?: string }) {
  const { user, className } = props
  const [isOpen, setIsOpen] = useState(false)
  const followingIds = useFollows(user.id)
  const followerIds = useFollowers(user.id)

  return (
    <>
      <TextButton onClick={() => setIsOpen(true)} className={className}>
        <span className={clsx('font-semibold')}>
          {followingIds?.length ?? ''}
        </span>{' '}
        Following
      </TextButton>

      <FollowsDialog
        user={user}
        defaultTab="following"
        followingIds={followingIds ?? []}
        followerIds={followerIds ?? []}
        isOpen={isOpen}
        setIsOpen={setIsOpen}
      />
    </>
  )
}

export function FollowersButton(props: { user: User; className?: string }) {
  const { user, className } = props
  const [isOpen, setIsOpen] = useState(false)
  const followingIds = useFollows(user.id)
  const followerIds = useFollowers(user.id)

  return (
    <>
      <TextButton onClick={() => setIsOpen(true)} className={className}>
        <span className="font-semibold">{followerIds?.length ?? ''}</span>{' '}
        Followers
      </TextButton>

      <FollowsDialog
        user={user}
        defaultTab="followers"
        followingIds={followingIds ?? []}
        followerIds={followerIds ?? []}
        isOpen={isOpen}
        setIsOpen={setIsOpen}
      />
    </>
  )
}

function FollowsDialog(props: {
  user: User
  followingIds: string[]
  followerIds: string[]
  defaultTab: 'following' | 'followers'
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
}) {
  const { user, followingIds, followerIds, defaultTab, isOpen, setIsOpen } =
    props

  const currentUser = useUser()
  const discoverUserIds = useDiscoverUsers(user?.id)
  usePrefetchUsers([...followingIds, ...followerIds, ...discoverUserIds])

  return (
    <Modal open={isOpen} setOpen={setIsOpen}>
      <Col className="max-h-[90vh] rounded bg-white p-6 pb-2">
        <div className="p-2 pb-1 text-xl">{user.name}</div>
        <div className="p-2 pt-0 text-sm text-gray-500">@{user.username}</div>
        <Tabs
          tabs={[
            {
              title: 'Following',
              content: <FollowList userIds={followingIds} />,
            },
            {
              title: 'Followers',
              content: <FollowList userIds={followerIds} />,
            },
            ...(currentUser
              ? [
                  {
                    title: 'Similar',
                    content: <FollowList userIds={discoverUserIds} />,
                  },
                ]
              : []),
          ]}
          defaultIndex={defaultTab === 'following' ? 0 : 1}
        />
      </Col>
    </Modal>
  )
}
