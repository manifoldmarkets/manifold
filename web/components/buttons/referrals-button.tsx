import clsx from 'clsx'
import { User } from 'common/user'
import { memo, useEffect, useState } from 'react'
import { useUser, useUserById } from 'web/hooks/use-user'
import { Col } from '../layout/col'
import { Modal } from '../layout/modal'
import { Tabs } from '../layout/tabs'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/widgets/avatar'
import { SelectUsers } from 'web/components/select-users'
import { TextButton } from './text-button'
import { UserLink } from 'web/components/widgets/user-link'
import { Button } from './button'
import { getReferrals } from 'web/lib/supabase/referrals'
import { UserSearchResult } from 'web/lib/supabase/users'
import { getReferralCount } from 'common/supabase/referrals'
import { db } from 'web/lib/supabase/db'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { ExclamationCircleIcon } from '@heroicons/react/outline'
import { referUser } from 'web/lib/firebase/api'
import { CopyLinkRow } from 'web/components/buttons/copy-link-button'
import { QRCode } from 'web/components/widgets/qr-code'
import { ENV_CONFIG } from 'common/envs/constants'
import { canSetReferrer } from 'web/lib/firebase/users'
import { formatMoney } from 'common/util/format'
import { REFERRAL_AMOUNT } from 'common/economy'

export const ReferralsButton = memo(function ReferralsButton(props: {
  user: User
  className?: string
}) {
  const { user, className } = props
  const [isOpen, setIsOpen] = useState(false)

  const [referralCount, setReferralCount] = useState(0)
  useEffect(() => {
    getReferralCount(user.id, 0, db).then(setReferralCount)
  }, [user.id])

  return (
    <>
      <TextButton onClick={() => setIsOpen(true)} className={className}>
        <span className="font-semibold">{referralCount}</span> Referrals
      </TextButton>
      <ReferralsDialog user={user} isOpen={isOpen} setIsOpen={setIsOpen} />
    </>
  )
})

export function ReferralsDialog(props: {
  user: User
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
}) {
  const { user, isOpen, setIsOpen } = props
  const [referredBy, setReferredBy] = useState<UserSearchResult[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorText, setErrorText] = useState('')
  const [referredUsers, setReferredUsers] = useState<
    UserSearchResult[] | undefined
  >(undefined)
  useEffect(() => {
    if (!isOpen || referredUsers !== undefined) return
    getReferrals(user.id).then(setReferredUsers)
  }, [referredUsers, isOpen, user.id])
  const currentUser = useUser()
  const referredByUser = useUserById(user.referredByUserId)
  const url = `https://${ENV_CONFIG.domain}?referrer=${user?.username}`

  return (
    <Modal open={isOpen} setOpen={setIsOpen}>
      <Col className="bg-canvas-0 rounded p-6">
        <span className={'text-primary-700 pb-2 text-xl'}>
          Refer a friend for{' '}
          <span className={'text-teal-500'}>
            ${formatMoney(REFERRAL_AMOUNT)}
          </span>{' '}
          each!
        </span>
        <Tabs
          className="my-2"
          tabs={[
            {
              title: 'Your referrer',
              content: (
                <>
                  {user.id === currentUser?.id && canSetReferrer(user) ? (
                    <Col className={'mt-1'}>
                      <span>Know who referred you?</span>
                      <SelectUsers
                        setSelectedUsers={setReferredBy}
                        selectedUsers={referredBy}
                        ignoreUserIds={[currentUser.id]}
                        showSelectedUsersTitle={false}
                        showUserUsername={true}
                        maxUsers={1}
                      />
                      {referredBy.length > 0 && (
                        <Row
                          className={
                            'bg-canvas-50 text-primary-700 mt-4 items-center rounded-md p-2'
                          }
                        >
                          <ExclamationCircleIcon className={'mr-2 h-5 w-5'} />
                          <span>
                            Keep in mind: you can only set who referred you
                            once!
                          </span>
                        </Row>
                      )}
                      <Row className={'mt-2 justify-end'}>
                        <Button
                          loading={isSubmitting}
                          disabled={referredBy.length === 0 || isSubmitting}
                          onClick={() => {
                            if (!referredBy[0]) return
                            setIsSubmitting(true)
                            referUser({
                              referredByUsername: referredBy[0].username,
                            })
                              .then(async () => {
                                setErrorText('')
                                setIsSubmitting(false)
                                setReferredBy([])
                                setIsOpen(false)
                              })
                              .catch((error) => {
                                setIsSubmitting(false)
                                console.log(error)
                                setErrorText(error.message)
                              })
                          }}
                        >
                          Save
                        </Button>
                      </Row>
                      <Row className={'justify-end'}>
                        <span className={'text-error'}>{errorText}</span>
                      </Row>
                    </Col>
                  ) : (
                    <div className="text-ink-700 justify-center">
                      {referredByUser ? (
                        <Row className={'items-center gap-2 p-2'}>
                          <Avatar
                            username={referredByUser.username}
                            avatarUrl={referredByUser.avatarUrl}
                          />
                          <UserLink user={referredByUser} />
                        </Row>
                      ) : (
                        <span className={'text-ink-500'}>No one...</span>
                      )}
                    </div>
                  )}
                </>
              ),
            },
            {
              title: `Your ${
                referredUsers && referredUsers.length > 0
                  ? referredUsers.length
                  : ''
              } referrals`,
              content: (
                <Col className="max-h-60 gap-2 overflow-y-scroll">
                  {referredUsers === undefined ? (
                    <LoadingIndicator />
                  ) : referredUsers.length === 0 ? (
                    <div className="text-ink-500">No users yet...</div>
                  ) : (
                    referredUsers.map((refUser) => (
                      <Row
                        key={refUser.id}
                        className={clsx(
                          'items-center justify-between gap-2 p-2'
                        )}
                      >
                        <Row className="items-center gap-2">
                          <Avatar
                            username={refUser?.username}
                            avatarUrl={refUser?.avatarUrl}
                          />
                          {refUser && <UserLink user={refUser} />}
                        </Row>
                      </Row>
                    ))
                  )}
                </Col>
              ),
            },
            {
              title: 'Share',
              content: (
                <Col className="gap-2">
                  <QRCode url={url} className="my-2 self-center" />
                  <CopyLinkRow
                    url={url}
                    eventTrackingName="copy referral link"
                  />
                </Col>
              ),
            },
          ]}
        />
      </Col>
    </Modal>
  )
}
