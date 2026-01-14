import { useState, useCallback } from 'react'
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
import { GiOpenChest, GiTwoCoins } from 'react-icons/gi'
import { TRADE_TERM } from 'common/envs/constants'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { DAY_MS } from 'common/util/time'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { api } from 'web/lib/api/api'
import { formatMoney } from 'common/util/format'
import toast from 'react-hot-toast'
import { DailyFreeLoanModal } from './daily-free-loan-modal'

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
  const [showFreeLoanModal, setShowFreeLoanModal] = useState(false)
  const [isClaiming, setIsClaiming] = useState(false)
  const [justClaimed, setJustClaimed] = useState(false)

  // Get free loan availability
  const {
    data: freeLoanData,
    refresh: refreshFreeLoan,
    loading: freeLoanLoading,
  } = useAPIGetter('get-free-loan-available', {})
  const canClaimFreeLoan = freeLoanData?.canClaim ?? false
  const freeLoanAmount = freeLoanData?.available ?? 0

  // Also check margin loan availability
  const { data: loanData, loading: loanLoading } = useAPIGetter(
    'get-next-loan-amount',
    {
      userId: user.id,
    }
  )
  const hasAnyLoanAvailable =
    (loanData?.available ?? 0) >= 1 || canClaimFreeLoan

  // Still loading data
  const isLoading = freeLoanLoading || loanLoading

  const isMobile = useIsMobile()

  const handleClaimFreeLoan = useCallback(async () => {
    if (!canClaimFreeLoan || isClaiming) return

    setIsClaiming(true)
    setJustClaimed(true) // Immediately show open chest
    try {
      const result = await api('claim-free-loan', {})
      if (result.success) {
        toast.success(`Claimed ${formatMoney(result.amount)} daily free loan!`)
        refreshFreeLoan()
        refreshPortfolio?.()
      } else {
        setJustClaimed(false) // Revert if failed
      }
    } catch (error: any) {
      toast.error(error?.message || 'Failed to claim free loan')
      setJustClaimed(false) // Revert on error
    } finally {
      setIsClaiming(false)
    }
  }, [canClaimFreeLoan, isClaiming, refreshFreeLoan, refreshPortfolio])

  const handleChestClick = useCallback(() => {
    if (canClaimFreeLoan && !isClaiming) {
      // Golden chest - auto claim
      handleClaimFreeLoan()
    } else {
      // Brown chest - open daily free loan modal
      setShowFreeLoanModal(true)
    }
  }, [canClaimFreeLoan, isClaiming, handleClaimFreeLoan])

  const createdRecently = user.createdTime > Date.now() - 2 * DAY_MS
  if (createdRecently) {
    return null
  }

  // Determine eligibility state
  const alreadyClaimedToday = (freeLoanData?.todaysFreeLoan ?? 0) > 0
  const atMaxLoanLimit =
    freeLoanData &&
    freeLoanData.totalLoan >= freeLoanData.maxLoan &&
    freeLoanData.maxLoan > 0
  const hasNoEligiblePositions =
    freeLoanData && !alreadyClaimedToday && !atMaxLoanLimit && !canClaimFreeLoan

  // Ineligible = at max limit OR no eligible positions (but NOT if already claimed)
  const isIneligible = atMaxLoanLimit || hasNoEligiblePositions
  // Disabled = no eligible positions (can't even repay if nothing invested)
  const isButtonDisabled = hasNoEligiblePositions

  const getTooltipText = () => {
    if (isLoading) return 'Loading...'
    if (canClaimFreeLoan && freeLoanAmount >= 1) {
      return `Claim ${formatMoney(freeLoanAmount)} daily free loan!`
    }
    if (alreadyClaimedToday) {
      return 'View your loans'
    }
    if (atMaxLoanLimit) {
      return 'At maximum loan limit - click to repay'
    }
    if (hasNoEligiblePositions) {
      return 'Invest more to earn free loans'
    }
    return 'View your loans'
  }

  if (showChest) {
    const isGolden = !justClaimed && canClaimFreeLoan && freeLoanAmount >= 1
    const tooltipText = isMobile ? undefined : getTooltipText()

    return (
      <>
        <Tooltip text={tooltipText} placement={'bottom'}>
          <button
            onClick={isButtonDisabled ? undefined : handleChestClick}
            disabled={isClaiming || isButtonDisabled}
            className={clsx(
              className,
              'items-center',
              dailyStatsClass,
              !isButtonDisabled && 'hover:bg-canvas-100',
              isClaiming && 'cursor-wait opacity-50',
              isIneligible && 'opacity-50',
              isButtonDisabled && 'cursor-not-allowed'
            )}
          >
            <Row
              className={clsx(
                'items-center justify-center whitespace-nowrap px-1'
              )}
            >
              {isGolden ? (
                <GiTwoCoins className="h-6 w-6 text-amber-500" />
              ) : (
                <GiOpenChest className="h-6 w-6 text-amber-700" />
              )}
            </Row>
            <div className="text-ink-600 text-xs">Loan</div>
          </button>
        </Tooltip>
        {showFreeLoanModal && (
          <DailyFreeLoanModal
            isOpen={showFreeLoanModal}
            setOpen={setShowFreeLoanModal}
            user={user}
            refreshPortfolio={refreshPortfolio}
          />
        )}
      </>
    )
  }

  // Non-chest button version (for portfolio page, etc.)
  return (
    <>
      <Tooltip
        text={
          isMobile
            ? undefined
            : !hasAnyLoanAvailable
            ? 'Not eligible for loan'
            : `Request a loan on your ${TRADE_TERM}s`
        }
        placement={'top'}
      >
        <Button
          className={className}
          color={'indigo-outline'}
          size={'md'}
          onClick={(e) => {
            e.stopPropagation()
            setShowLoansModal(true)
          }}
        >
          Loans <GiTwoCoins className="ml-1 h-5 w-5 text-amber-500" />
        </Button>
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
