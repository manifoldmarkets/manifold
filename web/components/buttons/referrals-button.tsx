import clsx from 'clsx'
import { User } from 'common/user'
import { memo, useEffect, useState } from 'react'
import { useUser, useUserById } from 'web/hooks/use-user'
import { Col } from '../layout/col'
import { Modal } from '../layout/modal'
import { Tabs } from '../layout/tabs'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/widgets/avatar'
import { FilterSelectUsers } from 'web/components/filter-select-users'
import { updateUser } from 'web/lib/firebase/users'
import { TextButton } from './text-button'
import { UserLink } from 'web/components/widgets/user-link'
import { Button } from './button'
import { getReferrals } from 'web/lib/supabase/referrals'
import { UserSearchResult } from 'web/lib/supabase/users'
import { getReferralCount } from 'common/supabase/referrals'
import { db } from 'web/lib/supabase/db'

export const ReferralsButton = memo(function ReferralsButton(props: {
  user: User
  className?: string
}) {
  const { user, className } = props
  const [isOpen, setIsOpen] = useState(false)
  const [referrals, setReferrals] = useState<UserSearchResult[] | undefined>(
    undefined
  )
  const [referralCount, setReferralCount] = useState(0)
  useEffect(() => {
    getReferralCount(user.id, 0, db).then(setReferralCount)
  }, [user.id])

  useEffect(() => {
    if (!isOpen || referrals !== undefined) return
    getReferrals(user.id).then(setReferrals)
  }, [referrals, isOpen, user.id])

  return (
    <>
      <TextButton onClick={() => setIsOpen(true)} className={className}>
        <span className="font-semibold">{referralCount}</span> Referrals
      </TextButton>
      <ReferralsDialog
        user={user}
        referredUsers={referrals ?? []}
        isOpen={isOpen}
        setIsOpen={setIsOpen}
      />
    </>
  )
})

function ReferralsDialog(props: {
  user: User
  referredUsers: UserSearchResult[]
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
}) {
  const { user, referredUsers, isOpen, setIsOpen } = props
  const [referredBy, setReferredBy] = useState<UserSearchResult[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorText, setErrorText] = useState('')

  const currentUser = useUser()
  const referredByUser = useUserById(user.referredByUserId)

  return (
    <Modal open={isOpen} setOpen={setIsOpen}>
      <Col className="bg-canvas-0 rounded p-6">
        <div className="p-2 pb-1 text-xl">{user.name}</div>
        <div className="text-ink-500 p-2 pt-0 text-sm">@{user.username}</div>
        <Tabs
          className="mb-4"
          tabs={[
            {
              title: 'Referrals',
              content: (
                <Col className="gap-2">
                  {referredUsers.length === 0 && (
                    <div className="text-ink-500">No users yet...</div>
                  )}
                  {referredUsers.map((refUser) => (
                    <Row
                      key={refUser.id}
                      className={clsx('items-center justify-between gap-2 p-2')}
                    >
                      <Row className="items-center gap-2">
                        <Avatar
                          username={refUser?.username}
                          avatarUrl={refUser?.avatarUrl}
                        />
                        {refUser && (
                          <UserLink
                            name={refUser.name}
                            username={refUser.username}
                          />
                        )}
                      </Row>
                    </Row>
                  ))}
                </Col>
              ),
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
                    <div className="text-ink-700 justify-center">
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
                        <span className={'text-ink-500'}>No one...</span>
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
