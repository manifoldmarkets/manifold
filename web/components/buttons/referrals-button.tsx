import clsx from 'clsx'
import { DisplayUser } from 'common/api/user-types'
import { REFERRAL_AMOUNT } from 'common/economy'
import { getReferralCount } from 'common/supabase/referrals'
import { User } from 'common/user'
import { useEffect, useState } from 'react'
import { CopyLinkRow } from 'web/components/buttons/copy-link-button'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/widgets/avatar'
import { TokenNumber } from 'web/components/widgets/token-number'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { UserLink } from 'web/components/widgets/user-link'
import { useUser } from 'web/hooks/use-user'
import { useDisplayUserById } from 'web/hooks/use-user-supabase'
import { db } from 'web/lib/supabase/db'
import { getReferrals } from 'web/lib/supabase/referrals'
import { Col } from '../layout/col'
import { CASH_COLOR } from '../portfolio/portfolio-graph'
import { Subtitle } from '../widgets/subtitle'
import { ENV_CONFIG } from 'common/envs/constants'

export const useReferralCount = (user: User) => {
  const [referralCount, setReferralCount] = useState(0)
  useEffect(() => {
    getReferralCount(user.id, 0, db).then(setReferralCount)
  }, [user.id])

  return referralCount
}

export function Referrals(props: { user: User }) {
  const { user } = props
  const [referredUsers, setReferredUsers] = useState<DisplayUser[] | undefined>(
    undefined
  )

  useEffect(() => {
    if (referredUsers !== undefined) return
    getReferrals(user.id).then(setReferredUsers)
  }, [referredUsers, user.id])
  const currentUser = useUser()
  const isYou = currentUser?.id === user.id

  const referredByUser = useDisplayUserById(user.referredByUserId)
  const url = `https://${ENV_CONFIG.domain}?referrer=${user?.username}`

  return (
    <Col className="bg-canvas-0 rounded p-6">
      {isYou && (
        <>
          <span className={'text-primary-700 pb-2 text-xl'}>
            Refer a friend for{' '}
            <span className={'text-teal-500'}>
              <TokenNumber
                coinType={'MANA'}
                amount={REFERRAL_AMOUNT}
                style={{
                  color: CASH_COLOR,
                }}
                className={clsx('mr-1 font-bold')}
                isInline
              />
            </span>{' '}
            each!
          </span>
          <CopyLinkRow
            linkBoxClassName="w-28"
            url={url}
            eventTrackingName="copy referral link"
          />
        </>
      )}

      <Subtitle>{isYou ? 'Your referrer' : 'Referred by'}</Subtitle>

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

      <Subtitle>
        {isYou ? 'Your ' : ''}
        {referredUsers && referredUsers.length > 0
          ? referredUsers.length
          : ''}{' '}
        referrals
      </Subtitle>

      <Col className="max-h-60 gap-2 overflow-y-scroll">
        {referredUsers === undefined ? (
          <LoadingIndicator />
        ) : referredUsers.length === 0 ? (
          <div className="text-ink-500">No users yet...</div>
        ) : (
          referredUsers.map((refUser) => (
            <Row
              key={refUser.id}
              className={clsx('items-center justify-between gap-2 p-2')}
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
    </Col>
  )
}
