import { Placement } from '@floating-ui/react'
import clsx from 'clsx'
import { KYC_VERIFICATION_BONUS_CASH } from 'common/economy'
import { SWEEPIES_NAME } from 'common/envs/constants'
import {
  getVerificationStatus,
  PROMPT_USER_VERIFICATION_MESSAGES,
} from 'common/gidx/user'
import { type User } from 'common/user'
import { capitalize } from 'lodash'
import Link from 'next/link'
import { ReactNode, useEffect, useState } from 'react'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { firebaseLogin } from 'web/lib/firebase/users'
import { db } from 'web/lib/supabase/db'
import { Button, buttonClass, ColorType } from '../buttons/button'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { CoinNumber } from '../widgets/coin-number'
import { Tooltip } from '../widgets/tooltip'
import { RainingCoins } from '../raining-coins'
import { SweepiesFlatCoin } from 'web/public/custom-components/sweepiesFlatCoin'

export function SweepVerifySection(props: { className?: string }) {
  const { className } = props
  const user = useUser()
  const privateUser = usePrivateUser()
  const [dismissed, setDismissed] = usePersistentLocalState(
    false,
    `toggle-verify-callout-dismissed`
  )

  if (dismissed || user === undefined || privateUser === undefined) return null

  if (user === null || privateUser === null) {
    return (
      <div
        className={`relative rounded-lg bg-gradient-to-b from-indigo-800 to-indigo-500 px-5 py-4 text-sm text-white shadow-lg  ${className}`}
      >
        <RainingCoins />
        <Col className="mb-8 mt-12 gap-4 items-center">
          <div className=" w-full text-xl sm:text-center sm:text-2xl">
            Start earning <b>real cash prizes</b> today.
          </div>

          <div>
            <div className='flex gap-1 items-center'> Step 1: Verify and claim your free sweepcash<SweepiesFlatCoin/> </div>
            <div> Step 2: Correctly predict on sweepstakes markets.</div>
            <div> Step 3: Withdraw winnings!</div>
          </div>
          <Col className="text-ink-100 dark:text-ink-900 w-full text-sm sm:text-center">
            <div>
              
              <CoinNumber
                amount={1}
                coinType="CASH"
                className="font-semibold text-amber-300"
                isInline
              />{' '}won
              → <b>$1</b>
            </div>
          </Col>

          <Col className="gap-2">
            <Button
              size="xl"
              color="gradient-amber"
              onClick={firebaseLogin}
              className="mx-auto w-fit text-white drop-shadow-lg"
            >
              Get started
            </Button>
          </Col>
        </Col>
      </div>
    )
  }

  const { message } = getVerificationStatus(user, privateUser)
  if (!PROMPT_USER_VERIFICATION_MESSAGES.includes(message)) return null

  return (
    <div
      className={`relative rounded-lg bg-gradient-to-b from-indigo-800 to-indigo-500 px-5 py-4 text-sm text-white shadow-lg  ${className}`}
    >
      <RainingCoins />
      <Col className="mb-8 mt-12 gap-4">
        <div className=" w-full text-xl sm:text-center sm:text-2xl">
          Start earning <b>real cash prizes</b> today.
        </div>

        <div className="text-ink-100 dark:text-ink-900 w-full text-sm sm:text-center">
          Winnings on {SWEEPIES_NAME} can be redeemed for USD at a{' '}
          <CoinNumber
            amount={1}
            coinType="CASH"
            className="font-semibold text-amber-300"
            isInline
          />{' '}
          → <b>$1</b> rate
        </div>

        <Col className="gap-2">
          <VerifyButton className=" !hover:from-amber-800 !hover:via-amber-700 !hover:to-amber-800 !mx-auto !w-fit !bg-gradient-to-r !from-amber-700 !via-amber-600 !to-amber-700 !text-white drop-shadow-lg" />

          <Row className=" w-full">
            <button
              onClick={() => setDismissed(true)}
              className="text-ink-200 dark:text-ink-800 hover:text-ink-600 mx-auto underline"
            >
              Dismiss
            </button>
          </Row>
        </Col>
      </Col>
    </div>
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
        'bg-ink-200 text-ink-700 w-fit select-none items-center rounded-sm px-1.5 py-0.5 text-xs font-semibold',
        className
      )}
    >
      <Tooltip
        text={`${capitalize(
          SWEEPIES_NAME
        )} is currently in beta, which means we’re still fine-tuning it. You may encounter some bugs or imperfections as we continue to improve it.`}
        placement={tooltipPlacement}
      >
        BETA
      </Tooltip>
    </Row>
  )
}

export function CalloutFrame(props: {
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

export function VerifyButton(props: {
  className?: string
  content?: ReactNode
  color?: ColorType
}) {
  const { className, content, color } = props

  const user = useUser()
  const amount = useKYCGiftAmount(user)

  return (
    <Link
      href={'/gidx/register'}
      className={clsx(
        buttonClass('xl', color ?? 'gradient-pink'),
        'w-full font-semibold',
        className
      )}
    >
      {content ? (
        content
      ) : (
        <>
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
        </>
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
