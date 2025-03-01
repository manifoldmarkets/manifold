import clsx from 'clsx'
import { NY_FL_CASHOUT_LIMIT, SWEEPIES_NAME } from 'common/envs/constants'
import { User } from 'common/user'
import { formatMoneyUSD } from 'common/util/format'
import { useState } from 'react'
import { IoIosWarning } from 'react-icons/io'
import { capitalize } from 'lodash'
import { Col } from '../layout/col'
import { Modal, MODAL_CLASS } from '../layout/modal'
import { TokenNumber } from '../widgets/token-number'
import { SWEEPIES_CASHOUT_FEE } from 'common/economy'

export function CashoutLimitWarning(props: {
  user: User | null | undefined
  className?: string
}) {
  const { user, className } = props
  const [open, setOpen] = useState(false)

  if (!user || !user.sweepstakes5kLimit) {
    return <></>
  }

  return (
    <>
      <div className={clsx('text-ink-700 w-full text-sm', className)}>
        <IoIosWarning className="mr-1 inline-block h-4 w-4 align-text-bottom text-orange-500" />
        <b>New York</b> and <b>Florida</b> have a{' '}
        <b>{formatMoneyUSD(NY_FL_CASHOUT_LIMIT)}</b> redemption limit per
        market.{' '}
        <button
          className="text-primary-600 font-semibold underline"
          onClick={() => setOpen(true)}
        >
          Learn more
        </button>
      </div>
      <Modal open={open} setOpen={setOpen}>
        <Col className={MODAL_CLASS}>
          <div className="text-primary-700 text-xl font-semibold">
            Redemption Limit
          </div>
          <span>
            Residents of <b>New York</b> and <b>Florida</b> have a{' '}
            <b>{formatMoneyUSD(NY_FL_CASHOUT_LIMIT)}</b> redemption limit per
            market.
          </span>

          <Col className="gap-1">
            <div className="text-ink-600 font-semibold">
              {capitalize(SWEEPIES_NAME)} Redemption
            </div>
            <span>
              <TokenNumber
                amount={1}
                coinType="CASH"
                className="font-semibold text-amber-700 dark:text-amber-300"
                isInline
              />{' '}
              → <b>$1</b>, with a{' '}
              <b>{formatMoneyUSD(SWEEPIES_CASHOUT_FEE)} fee</b>. To receive the
              full {formatMoneyUSD(NY_FL_CASHOUT_LIMIT)} in cash after the fee,
              you would need to redeem approximately{' '}
              <TokenNumber
                amount={NY_FL_CASHOUT_LIMIT - SWEEPIES_CASHOUT_FEE}
                coinType="CASH"
                className="font-semibold text-amber-700 dark:text-amber-300"
                isInline
              />{' '}
              worth of {SWEEPIES_NAME}.
            </span>
          </Col>
          <Col className="gap-1">
            <div className="text-ink-600 font-semibold">Redemption Limit</div>
            <span>
              Any Sweepies exceeding this{' '}
              <TokenNumber
                amount={NY_FL_CASHOUT_LIMIT - SWEEPIES_CASHOUT_FEE}
                coinType="CASH"
                className="font-semibold text-amber-700 dark:text-amber-300"
                isInline
              />{' '}
              limit remain in your account for participating in other
              sweepstakes markets, but they cannot be redeemed for cash.
            </span>
          </Col>

          <Col className="gap-1">
            <div className="text-ink-600 font-semibold">
              Multi-Choice Markets
            </div>
            <span>
              In multi-choice markets, the redemption limit applies separately
              to each answer. This means you can redeem up to{' '}
              <TokenNumber
                amount={NY_FL_CASHOUT_LIMIT - SWEEPIES_CASHOUT_FEE}
                coinType="CASH"
                className="font-semibold text-amber-700 dark:text-amber-300"
                isInline
              />{' '}
              (to recieve {formatMoneyUSD(NY_FL_CASHOUT_LIMIT)}) for each
              answer.
            </span>
          </Col>
        </Col>
      </Modal>
    </>
  )
}
