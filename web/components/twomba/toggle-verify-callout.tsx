import { Placement } from '@floating-ui/react'
import clsx from 'clsx'
import { KYC_VERIFICATION_BONUS_CASH } from 'common/economy'
import { SWEEPIES_NAME, TRADE_TERM } from 'common/envs/constants'
import { capitalize } from 'lodash'
import Link from 'next/link'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { buttonClass } from '../buttons/button'
import { Row } from '../layout/row'
import { CoinNumber } from '../widgets/coin-number'
import { Tooltip } from '../widgets/tooltip'
import { useEffect, useState } from 'react'
import { db } from 'web/lib/supabase/db'
import { type User } from 'common/user'
import {
  getVerificationStatus,
  PROMPT_USER_VERIFICATION_MESSAGES,
} from 'common/gidx/user'

export function ToggleVerifyCallout(props: {
  className?: string
  caratClassName?: string
}) {
  const { className, caratClassName } = props
  const user = useUser()
  const privateUser = usePrivateUser()
  const [dismissed, setDismissed] = usePersistentLocalState(
    false,
    `toggle-verify-callout-dismissed`
  )

  if (dismissed || user === undefined || privateUser === undefined) return null

  // TWODO: Add a link to about here
  if (user === null || privateUser === null) {
    return (
      <CalloutFrame
        className={className}
        setDismissed={setDismissed}
        caratClassName={caratClassName}
      >
        <Row className="w-full justify-between gap-2">
          <div className=" font-semibold">Sweepstakes are here</div>
          <InBeta className="mb-2" tooltipPlacement={'bottom'} />
        </Row>
        <div className="text-ink-700 text-sm">
          This is a <b>sweepstakes market</b>! {capitalize(TRADE_TERM)} with{' '}
          {SWEEPIES_NAME} for the chance to win real cash prizes.
        </div>
      </CalloutFrame>
    )
  }

  const { message } = getVerificationStatus(user, privateUser)
  if (!PROMPT_USER_VERIFICATION_MESSAGES.includes(message)) return null

  return (
    <CalloutFrame
      className={className}
      setDismissed={setDismissed}
      caratClassName={caratClassName}
    >
      <Row className="w-full justify-between gap-2">
        <div className="font-semibold">Sweepstakes are here</div>
        <InBeta className="mb-2" tooltipPlacement={'bottom'} />
      </Row>
      Verify your identity and start earning <b>real cash prizes</b> today.
      <div
        className={clsx('absolute -top-[10px] right-4 h-0 w-0', caratClassName)}
      >
        <div className="border-b-ink-300 relative h-0 w-0 border-b-[10px] border-l-[10px] border-r-[10px] border-l-transparent border-r-transparent">
          <div className="border-b-canvas-50 absolute -left-[9px] top-[1px] h-0 w-0 border-b-[9px] border-l-[9px] border-r-[9px] border-l-transparent border-r-transparent"></div>
        </div>
      </div>
      <VerifyButton className="mt-2" />
    </CalloutFrame>
  )
}

export function InBeta(props: {
  className?: string
  tooltipPlacement?: Placement
}) {
  const { className, tooltipPlacement } = props
  return (
    <Row
      className={clsx(
        ' bg-ink-200 text-ink-700 w-fit select-none items-center rounded-sm px-1.5 py-0.5 text-xs font-semibold',
        className
      )}
    >
      <Tooltip
        text={`${SWEEPIES_NAME} is currently in beta, which means we’re still fine-tuning it. You may encounter some bugs or imperfections as we continue to improve it.`}
        placement={tooltipPlacement}
      >
        IN BETA
      </Tooltip>
    </Row>
  )
}
function CalloutFrame(props: {
  children: React.ReactNode
  className?: string
  caratClassName?: string
  setDismissed: (dismissed: boolean) => void
}) {
  const { children, className, caratClassName, setDismissed } = props
  return (
    <div className={className}>
      <div className="border-ink-300 bg-canvas-50 text-ink-800 relative rounded-lg border px-5 py-4 text-sm shadow-lg">
        {children}

        <Row className="mt-1 w-full">
          <button
            onClick={() => setDismissed(true)}
            className="text-ink-500 hover:text-ink-600 mx-auto underline"
          >
            Dismiss
          </button>
        </Row>

        <div
          className={clsx(
            'absolute -top-[10px] right-4 h-0 w-0',
            caratClassName
          )}
        >
          <div className="border-b-ink-300 relative h-0 w-0 border-b-[10px] border-l-[10px] border-r-[10px] border-l-transparent border-r-transparent">
            <div className="border-b-canvas-50 absolute -left-[9px] top-[1px] h-0 w-0 border-b-[9px] border-l-[9px] border-r-[9px] border-l-transparent border-r-transparent"></div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function VerifyButton(props: { className?: string }) {
  const { className } = props

  const user = useUser()
  const amount = useKYCGiftAmount(user)

  return (
    <Link
      href={'/gidx/register'}
      className={clsx(
        buttonClass('md', 'gradient-pink'),
        'w-full font-semibold',
        className
      )}
    >
      Verify and claim
      {amount == undefined ? (
        <CoinNumber
          amount={KYC_VERIFICATION_BONUS_CASH}
          coinType="CASH"
          className="ml-1"
        />
      ) : (
        <CoinNumber amount={amount} coinType="CASH" className="ml-1" />
      )}
    </Link>
  )
}

export function useKYCGiftAmount(user: User | undefined | null) {
  const [amount, setAmount] = useState<number>()
  useEffect(() => {
    if (!user) return
    db.from('kyc_bonus_rewards')
      .select('reward_amount')
      .eq('user_id', user.id)
      .then(({ data, error }) => {
        if (error) {
          console.error(error)
          return
        }
        if (data && data.length > 0) {
          setAmount(
            Math.max(KYC_VERIFICATION_BONUS_CASH, data[0].reward_amount)
          )
        }
      })
  }, [user?.id])

  return amount
}
