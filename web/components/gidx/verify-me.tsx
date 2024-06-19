import { User } from 'common/user'
import { KYC_VERIFICATION_BONUS } from 'common/economy'
import { formatMoney } from 'common/util/format'
import { Col } from 'web/components/layout/col'
import { CoinNumber } from 'web/components/widgets/manaCoinNumber'
import Link from 'next/link'
import clsx from 'clsx'
import { Button, buttonClass } from 'web/components/buttons/button'
import { api } from 'web/lib/firebase/api'
import { usePollUser } from 'web/hooks/use-user'

export const VerifyMe = (props: { user: User | null | undefined }) => {
  const user = usePollUser(props.user?.id)

  if (!user) return null
  if (user.kycStatus === 'verified') return null
  if (user.kycStatus === 'pending') {
    return (
      <Col
        className={
          'border-ink-400 m-2 items-center justify-between gap-2 rounded-sm border bg-indigo-200 p-2 px-3 dark:bg-indigo-700 sm:flex-row'
        }
      >
        <span>Verification pending. </span>
        <Button
          onClick={async () => {
            await api('get-verification-status-gidx', {})
          }}
        >
          Refresh status
        </Button>
      </Col>
    )
  }

  return (
    <Col
      className={
        'border-ink-400 m-2 items-center justify-between gap-2 rounded-sm border bg-indigo-200 p-2 px-3 dark:bg-indigo-700 sm:flex-row'
      }
    >
      <span>
        Verify your identity to collect{' '}
        <CoinNumber
          amount={KYC_VERIFICATION_BONUS}
          className={'font-bold'}
          isInline
        />
        .{' '}
      </span>
      <Link
        href={'gidx/register'}
        className={clsx(buttonClass('md', 'indigo'))}
      >
        Claim {formatMoney(KYC_VERIFICATION_BONUS)}
      </Link>
    </Col>
  )
}
