import clsx from 'clsx'
import { PencilIcon } from '@heroicons/react/outline'

import { User } from 'common/user'
import { useEffect, useState } from 'react'
import { prefetchUsers, useUserById } from 'web/hooks/use-user'
import { Col } from './layout/col'
import { Modal } from './layout/modal'
import { Tabs } from './layout/tabs'
import { TextButton } from './text-button'
import { track } from 'web/lib/service/analytics'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/avatar'
import { UserLink } from 'web/components/user-page'
import { useReferrals } from 'web/hooks/use-referrals'

export function EditReferredByButton(props: {
  user: User
  className?: string
}) {
  const { user, className } = props
  const [isOpen, setIsOpen] = useState(false)
  return (
    <div
      className={clsx(
        className,
        'btn btn-sm btn-ghost cursor-pointer gap-2 whitespace-nowrap text-sm normal-case text-gray-700'
      )}
      onClick={() => {
        setIsOpen(true)
        track('edit referred by button')
      }}
    >
      <PencilIcon className="inline h-4 w-4" />
      Referred By {user.referredByUserId ?? 'No one'}
    </div>
  )
}

export function ReferralsButton(props: { user: User }) {
  const { user } = props
  const [isOpen, setIsOpen] = useState(false)
  const referralIds = useReferrals(user.id)

  return (
    <>
      <TextButton onClick={() => setIsOpen(true)}>
        <span className="font-semibold">{referralIds?.length ?? ''}</span>{' '}
        Referrals
      </TextButton>

      <ReferralsDialog
        user={user}
        referralIds={referralIds ?? []}
        isOpen={isOpen}
        setIsOpen={setIsOpen}
      />
    </>
  )
}

function ReferralsDialog(props: {
  user: User
  referralIds: string[]
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
}) {
  const { user, referralIds, isOpen, setIsOpen } = props

  useEffect(() => {
    prefetchUsers([...referralIds])
  }, [referralIds])

  return (
    <Modal open={isOpen} setOpen={setIsOpen}>
      <Col className="rounded bg-white p-6">
        <div className="p-2 pb-1 text-xl">{user.name}</div>
        <div className="p-2 pt-0 text-sm text-gray-500">@{user.username}</div>
        <Tabs
          tabs={[
            {
              title: 'Referrals',
              content: <ReferralsList userIds={referralIds} />,
            },
          ]}
        />
      </Col>
    </Modal>
  )
}

function ReferralsList(props: { userIds: string[] }) {
  const { userIds } = props

  return (
    <Col className="gap-2">
      {userIds.length === 0 && (
        <div className="text-gray-500">No users yet...</div>
      )}
      {userIds.map((userId) => (
        <UserReferralItem key={userId} userId={userId} />
      ))}
    </Col>
  )
}

function UserReferralItem(props: { userId: string; className?: string }) {
  const { userId, className } = props
  const user = useUserById(userId)

  return (
    <Row className={clsx('items-center justify-between gap-2 p-2', className)}>
      <Row className="items-center gap-2">
        <Avatar username={user?.username} avatarUrl={user?.avatarUrl} />
        {user && <UserLink name={user.name} username={user.username} />}
      </Row>
    </Row>
  )
}
