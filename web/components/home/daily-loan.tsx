import { useState } from 'react'
import { User } from 'common/user'
import { LoansModal } from 'web/components/profile/loans-modal'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { useHasReceivedLoanToday } from 'web/hooks/use-has-received-loan'
import { Tooltip } from 'web/components/widgets/tooltip'
import { Button } from 'web/components/buttons/button'
import clsx from 'clsx'
import { dailyStatsClass } from 'web/components/home/daily-stats'
import { Row } from 'web/components/layout/row'
import { GiOpenChest, GiTwoCoins } from 'react-icons/gi'
import { TRADE_TERM } from 'common/envs/constants'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { DAY_MS } from 'common/util/time'

dayjs.extend(utc)
dayjs.extend(timezone)

export function DailyLoan(props: {
  user: User
  refreshPortfolio?: () => void
  showChest?: boolean
  className?: string
}) {
  const { user, showChest = true, refreshPortfolio, className } = props

  const [showLoansModal, setShowLoansModal] = useState(false)
  const { receivedLoanToday: receivedTxnLoan } = useHasReceivedLoanToday(user)
  const { data } = useAPIGetter('get-next-loan-amount', { userId: user.id })
  const notEligibleForLoan = (data?.amount ?? 0) < 1

  const receivedLoanToday = receivedTxnLoan

  const handleButtonClick = () => {
    setShowLoansModal(true)
  }

  const createdRecently = user.createdTime > Date.now() - 2 * DAY_MS
  if (createdRecently) {
    return null
  }
  if (showChest) {
    return (
      <>
        <Tooltip
          text={
            receivedLoanToday
              ? 'Loan already collected'
              : notEligibleForLoan
              ? 'Not eligible for loan'
              : `Collect a loan on your ${TRADE_TERM}s`
          }
          placement={'bottom'}
        >
          <button
            onClick={handleButtonClick}
            className={clsx(
              className,
              'items-center',
              dailyStatsClass,
              receivedLoanToday || notEligibleForLoan
                ? ''
                : 'hover:bg-canvas-100'
            )}
          >
            <Row
              className={clsx(
                'items-center justify-center whitespace-nowrap px-1'
              )}
            >
              {receivedLoanToday || notEligibleForLoan ? (
                <GiOpenChest className="h-6 w-6 text-yellow-900" />
              ) : (
                <GiTwoCoins className="h-6 w-6 text-yellow-300" />
              )}
            </Row>
            <div className="text-ink-600 text-xs">Loan</div>
          </button>
        </Tooltip>
        {showLoansModal && (
          <LoansModal
            isOpen={showLoansModal}
            user={user}
            setOpen={setShowLoansModal}
            refreshPortfolio={refreshPortfolio}
          />
        )}
      </>
    )
  }
  return (
    <Button
      className={className}
      color={'gray-outline'}
      size={'2xs'}
      onClick={(e) => {
        e.stopPropagation()
        handleButtonClick()
      }}
    >
      <Tooltip
        text={
          receivedLoanToday
            ? 'Loan already collected'
            : notEligibleForLoan
            ? 'Not eligible for loan'
            : `Collect a loan on your ${TRADE_TERM}s`
        }
        placement={'top'}
      >
        Get loan
      </Tooltip>
      {showLoansModal && (
        <LoansModal
          isOpen={showLoansModal}
          user={user}
          setOpen={setShowLoansModal}
          refreshPortfolio={refreshPortfolio}
        />
      )}
    </Button>
  )
}
