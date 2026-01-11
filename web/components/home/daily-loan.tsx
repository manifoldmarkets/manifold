import { useState } from 'react'
import { User } from 'common/user'
import { LoansModal } from 'web/components/profile/loans-modal'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { Tooltip } from 'web/components/widgets/tooltip'
import { Button } from 'web/components/buttons/button'
import clsx from 'clsx'
import { dailyStatsClass } from 'web/components/home/daily-stats'
import { Row } from 'web/components/layout/row'
import { GiOpenChest } from 'react-icons/gi'
import { TRADE_TERM } from 'common/envs/constants'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { DAY_MS } from 'common/util/time'
import { useIsMobile } from 'web/hooks/use-is-mobile'

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
  const { data } = useAPIGetter('get-next-loan-amount', { userId: user.id })
  const notEligibleForLoan = (data?.available ?? 0) < 1
  const isMobile = useIsMobile()

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
            isMobile
              ? undefined
              : notEligibleForLoan
              ? 'Not eligible for loan'
              : `Request a loan on your ${TRADE_TERM}s`
          }
          placement={'bottom'}
        >
          <button
            onClick={handleButtonClick}
            className={clsx(
              className,
              'items-center',
              dailyStatsClass,
              notEligibleForLoan ? '' : 'hover:bg-canvas-100'
            )}
          >
            <Row
              className={clsx(
                'items-center justify-center whitespace-nowrap px-1'
              )}
            >
              <GiOpenChest className="h-6 w-6 text-amber-900" />
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
          isMobile
            ? undefined
            : notEligibleForLoan
            ? 'Not eligible for loan'
            : `Request a loan on your ${TRADE_TERM}s`
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
