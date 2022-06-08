import clsx from 'clsx'
import { PencilIcon } from '@heroicons/react/outline'
import { User } from 'common/user'
import { useEffect, useState } from 'react'
import { useFollowers, useFollows } from 'web/hooks/use-follows'
import { prefetchUsers, useUser } from 'web/hooks/use-user'
import { FollowList } from './follow-list'
import { Col } from './layout/col'
import { Modal } from './layout/modal'
import { Tabs } from './layout/tabs'
import { useDiscoverUsers } from 'web/hooks/use-users'

export function FollowingButton(props: { user: User }) {
  const { user } = props
  const [open, setOpen] = useState(false)
  const followingIds = useFollows(user.id)
  const followerIds = useFollowers(user.id)

  return (
    <>
      <div
        className="cursor-pointer gap-2 hover:underline focus:underline"
        tabIndex={0}
        onClick={() => setOpen(true)}
      >
        <span className="font-semibold">{followingIds?.length ?? ''}</span>{' '}
        Following
      </div>

      <FollowingFollowersDialog
        user={user}
        defaultTab="following"
        followingIds={followingIds ?? []}
        followerIds={followerIds ?? []}
        isOpen={open}
        setIsOpen={setOpen}
      />
    </>
  )
}

export function EditFollowingButton(props: { user: User; className?: string }) {
  const { user, className } = props
  const [open, setOpen] = useState(false)
  const followingIds = useFollows(user.id)
  const followerIds = useFollowers(user.id)

  return (
    <div
      className={clsx(
        className,
        'btn btn-sm btn-ghost cursor-pointer gap-2 whitespace-nowrap text-sm normal-case text-gray-700'
      )}
      onClick={() => setOpen(true)}
    >
      <PencilIcon className="inline h-4 w-4" />
      <div>
        <span className="font-semibold">{followingIds?.length ?? ''}</span>{' '}
        Following
      </div>

      <FollowingFollowersDialog
        user={user}
        defaultTab="following"
        followingIds={followingIds ?? []}
        followerIds={followerIds ?? []}
        isOpen={open}
        setIsOpen={setOpen}
      />
    </div>
  )
}

export function FollowersButton(props: { user: User }) {
  const { user } = props
  const [isOpen, setIsOpen] = useState(false)
  const followingIds = useFollows(user.id)
  const followerIds = useFollowers(user.id)

  return (
    <>
      <div
        className="cursor-pointer gap-2 hover:underline focus:underline"
        tabIndex={0}
        onClick={() => setIsOpen(true)}
      >
        <span className="font-semibold">{followerIds?.length ?? ''}</span>{' '}
        Followers
      </div>

      <FollowingFollowersDialog
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

function FollowingFollowersDialog(props: {
  user: User
  followingIds: string[]
  followerIds: string[]
  defaultTab: 'following' | 'followers'
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
}) {
  const { user, followingIds, followerIds, defaultTab, isOpen, setIsOpen } =
    props

  useEffect(() => {
    prefetchUsers([...followingIds, ...followerIds])
  }, [followingIds, followerIds])

  const currentUser = useUser()

  const discoverUserIds = useDiscoverUsers()
  useEffect(() => {
    prefetchUsers(discoverUserIds)
  }, [discoverUserIds])

  return (
    <Modal open={isOpen} setOpen={setIsOpen}>
      <Col className="rounded bg-white p-6">
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
                    title: 'Discover',
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
