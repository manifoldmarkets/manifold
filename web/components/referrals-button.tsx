import clsx from 'clsx'
import { User } from 'common/user'
import { useEffect, useState } from 'react'
import { usePrefetchUsers, useUserById } from 'web/hooks/use-user'
import { Col } from './layout/col'
import { Modal } from './layout/modal'
import { Tabs } from './layout/tabs'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/avatar'
import { useReferrals } from 'web/hooks/use-referrals'
import { FilterSelectUsers } from 'web/components/filter-select-users'
import { getUser, updateUser } from 'web/lib/firebase/users'
import { TextButton } from 'web/components/text-button'
import { UserLink } from 'web/components/user-link'
import { Button } from './button'

export function ReferralsButton(props: {
  user: User
  currentUser?: User
  className?: string
}) {
  const { user, currentUser, className } = props
  const [isOpen, setIsOpen] = useState(false)
  const referralIds = useReferrals(user.id)

  return (
    <>
      <TextButton onClick={() => setIsOpen(true)} className={className}>
        <span className="font-semibold">{referralIds?.length ?? ''}</span>{' '}
        Referrals
      </TextButton>
      <ReferralsDialog
        user={user}
        referralIds={referralIds ?? []}
        isOpen={isOpen}
        setIsOpen={setIsOpen}
        currentUser={currentUser}
      />
    </>
  )
}

function ReferralsDialog(props: {
  user: User
  referralIds: string[]
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  currentUser?: User
}) {
  const { user, referralIds, isOpen, setIsOpen, currentUser } = props
  const [referredBy, setReferredBy] = useState<User[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorText, setErrorText] = useState('')

  const [referredByUser, setReferredByUser] = useState<User | null>()
  useEffect(() => {
    if (isOpen && !referredByUser && user?.referredByUserId) {
      getUser(user.referredByUserId).then((user) => {
        setReferredByUser(user)
      })
    }
  }, [isOpen, referredByUser, user.referredByUserId])

  usePrefetchUsers(referralIds)

  return (
    <Modal open={isOpen} setOpen={setIsOpen}>
      <Col className="rounded bg-white p-6">
        <div className="p-2 pb-1 text-xl">{user.name}</div>
        <div className="p-2 pt-0 text-sm text-gray-500">@{user.username}</div>
        <Tabs
          className="mb-4"
          tabs={[
            {
              title: 'Referrals',
              content: <ReferralsList userIds={referralIds} />,
            },
            {
              title: 'Referred by',
              content: (
                <>
                  {user.id === currentUser?.id && !referredByUser ? (
                    <>
                      <FilterSelectUsers
                        setSelectedUsers={setReferredBy}
                        selectedUsers={referredBy}
                        ignoreUserIds={[currentUser.id]}
                        showSelectedUsersTitle={false}
                        selectedUsersClassName={'grid-cols-2 '}
                        maxUsers={1}
                      />
                      <Row className={'mt-0 justify-end'}>
                        <Button
                          className={
                            referredBy.length === 0 ? 'hidden' : 'my-2 w-24'
                          }
                          disabled={referredBy.length === 0 || isSubmitting}
                          onClick={() => {
                            setIsSubmitting(true)
                            updateUser(currentUser.id, {
                              referredByUserId: referredBy[0].id,
                            })
                              .then(async () => {
                                setErrorText('')
                                setIsSubmitting(false)
                                setReferredBy([])
                                setIsOpen(false)
                              })
                              .catch((error) => {
                                setIsSubmitting(false)
                                setErrorText(error.message)
                              })
                          }}
                        >
                          Save
                        </Button>
                      </Row>
                      <span className={'text-warning'}>
                        {referredBy.length > 0 &&
                          'Careful: you can only set who referred you once!'}
                      </span>
                      <span className={'text-error'}>{errorText}</span>
                    </>
                  ) : (
                    <div className="justify-center text-gray-700">
                      {referredByUser ? (
                        <Row className={'items-center gap-2 p-2'}>
                          <Avatar
                            username={referredByUser.username}
                            avatarUrl={referredByUser.avatarUrl}
                          />
                          <UserLink
                            username={referredByUser.username}
                            name={referredByUser.name}
                          />
                        </Row>
                      ) : (
                        <span className={'text-gray-500'}>No one...</span>
                      )}
                    </div>
                  )}
                </>
              ),
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
