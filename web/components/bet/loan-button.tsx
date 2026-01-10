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
  className?: string
  refreshPortfolio?: () => void
}) {
  const { contractId, user, className, refreshPortfolio } = props
  const [showLoansModal, setShowLoansModal] = useState(false)

  const { data: marketLoanData, refresh: refetchMarketLoan } = useAPIGetter(
    'get-market-loan-max',
    { contractId }
  )

  const currentLoan = marketLoanData?.currentLoan ?? 0
  const available = marketLoanData?.available ?? 0
  const maxLoan = marketLoanData?.maxLoan ?? 0

  // Don't show if no loan available and no current loan
  if (maxLoan <= 0 && currentLoan <= 0) {
    return null
  }

  const hasLoan = currentLoan > 0
  const hasAvailable = available > 0

  return (
    <>
      <Tooltip
        text={
          hasLoan
            ? `Current loan: ${formatMoney(currentLoan)}. ${
                hasAvailable
                  ? `${formatMoney(available)} more available.`
                  : 'Max loan reached.'
              }`
            : `Borrow up to ${formatMoney(available)} on this market`
        }
        placement="top"
      >
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
          refreshPortfolio={() => {
            refetchMarketLoan()
            refreshPortfolio?.()
          }}
        />
      )}
    </>
  )
}
