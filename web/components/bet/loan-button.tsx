import { useState } from 'react'
import clsx from 'clsx'
import { GiOpenChest } from 'react-icons/gi'
import { LoansModal } from 'web/components/profile/loans-modal'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { User } from 'common/user'
import { formatMoney } from 'common/util/format'
import { Button } from 'web/components/buttons/button'
import { Row } from 'web/components/layout/row'
import { Tooltip } from 'web/components/widgets/tooltip'

export function LoanButton(props: {
  contractId: string
  user: User
  answerId?: string
  className?: string
  refreshPortfolio?: () => void
}) {
  const { contractId, user, answerId, className, refreshPortfolio } = props
  const [showLoansModal, setShowLoansModal] = useState(false)

  const { data: marketLoanData, refresh: refetchMarketLoan } = useAPIGetter(
    'get-market-loan-max',
    { contractId }
  )

  const currentLoan = marketLoanData?.currentLoan ?? 0
  const available = marketLoanData?.available ?? 0
  const maxLoan = marketLoanData?.maxLoan ?? 0
  const eligible = marketLoanData?.eligible ?? false
  const eligibilityReason = marketLoanData?.eligibilityReason

  // Don't show if no loan available and no current loan
  // But always show if there's a current loan (so users can repay)
  if (maxLoan <= 0 && currentLoan <= 0) {
    return null
  }

  const hasLoan = currentLoan > 0
  const hasAvailable = available > 0 && eligible

  const getTooltipText = () => {
    if (hasLoan) {
      if (!eligible) {
        return `Current loan: ${formatMoney(currentLoan)}. ${
          eligibilityReason ?? 'Not eligible for more loans.'
        }`
      }
      return `Current loan: ${formatMoney(currentLoan)}. ${
        hasAvailable
          ? `${formatMoney(available)} more available.`
          : 'Max loan reached.'
      }`
    }
    if (!eligible) {
      return eligibilityReason ?? 'Market not eligible for loans'
    }
    return `Borrow up to ${formatMoney(available)} on this market`
  }

  return (
    <>
      <Tooltip text={getTooltipText()} placement="top">
        <Button
          color={hasLoan ? 'amber-outline' : 'amber'}
          size="xs"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setShowLoansModal(true)
          }}
          className={clsx('gap-1', className)}
        >
          <GiOpenChest className="h-4 w-4" />
          <span className="text-xs">
            {hasLoan ? formatMoney(currentLoan) : 'Loan'}
          </span>
        </Button>
      </Tooltip>

      {showLoansModal && (
        <LoansModal
          user={user}
          isOpen={showLoansModal}
          setOpen={setShowLoansModal}
          contractId={contractId}
          answerId={answerId}
          refreshPortfolio={() => {
            refetchMarketLoan()
            refreshPortfolio?.()
          }}
        />
      )}
    </>
  )
}
