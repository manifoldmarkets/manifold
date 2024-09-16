import { XIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { KYC_VERIFICATION_BONUS_CASH } from 'common/economy'
import {
  getVerificationStatus,
  PROMPT_VERIFICATION_MESSAGES,
} from 'common/user'
import Link from 'next/link'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { useUser } from 'web/hooks/use-user'
import { buttonClass } from '../buttons/button'
import { CoinNumber } from '../widgets/coin-number'
import { SWEEPIES_NAME, TRADE_TERM } from 'common/envs/constants'
import { capitalize } from 'lodash'

export function ToggleVerifyCallout(props: {
  className?: string
  caratClassName?: string
}) {
  const { className, caratClassName } = props
  const user = useUser()
  const [dismissed, setDismissed] = usePersistentLocalState(
    false,
    `toggle-verify-callout-dismissed-${user?.id ?? 'logged-out'}`
  )

  if (dismissed) return null

  // TWODO: Add a link to about here
  if (!user) {
    return (
      <CalloutFrame
        className={className}
        setDismissed={setDismissed}
        caratClassName={caratClassName}
      >
        <div className="text-sm">
          This is a <b>{SWEEPIES_NAME} market</b>! {capitalize(TRADE_TERM)} with{' '}
          {SWEEPIES_NAME} for the chance to win real cash prizes.
        </div>
      </CalloutFrame>
    )
  }

  const { message } = getVerificationStatus(user)

  if (!PROMPT_VERIFICATION_MESSAGES.includes(message)) return null

  return (
    <CalloutFrame
      className={className}
      setDismissed={setDismissed}
      caratClassName={caratClassName}
    >
      Why stop at play money? Verify your identity and start earning{' '}
      <b>real cash prizes</b> today.
      <div
        className={clsx('absolute -top-[10px] right-4 h-0 w-0', caratClassName)}
      >
        <div className="border-b-ink-300 relative h-0 w-0 border-b-[10px] border-l-[10px] border-r-[10px] border-l-transparent border-r-transparent">
          <div className="border-b-canvas-50 absolute -left-[9px] top-[1px] h-0 w-0 border-b-[9px] border-l-[9px] border-r-[9px] border-l-transparent border-r-transparent"></div>
        </div>
      </div>
      <VerifyButton />
    </CalloutFrame>
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
        <button
          onClick={() => setDismissed(true)}
          className="text-ink-300 hover:text-ink-600 absolute right-1 top-1"
        >
          <XIcon className="h-4 w-4" />
        </button>
        {children}
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
  return (
    <Link
      href={'gidx/register'}
      className={clsx(
        buttonClass('md', 'gradient-pink'),
        'w-full font-semibold',
        className
      )}
    >
      Verify and claim
      <CoinNumber
        amount={KYC_VERIFICATION_BONUS_CASH}
        coinType="CASH"
        className="ml-1"
      />
    </Link>
  )
}
