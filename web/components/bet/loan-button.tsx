import { useState } from 'react'
import clsx from 'clsx'
import { MarketLoanModal } from 'web/components/bet/market-loan-modal'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { User } from 'common/user'
import { formatMoney } from 'common/util/format'
import { Button } from 'web/components/buttons/button'
import { Tooltip } from 'web/components/widgets/tooltip'

export function LoanButton(props: {
  contractId: string
  user: User
  answerId?: string
  className?: string
}) {
  const { contractId, user, answerId, className } = props
  const [showLoansModal, setShowLoansModal] = useState(false)

  const { data: marketLoanData } = useAPIGetter('get-market-loan-max', {
    contractId,
    answerId,
  })

  const currentMarketLoan = marketLoanData?.currentLoan ?? 0
  const currentFreeLoan = marketLoanData?.currentFreeLoan ?? 0
  const currentMarginLoan = marketLoanData?.currentMarginLoan ?? 0

  const hasLoan = currentMarketLoan > 0

  const getTooltipText = () => {
    if (!hasLoan) {
      return 'No loan on this market'
    }
    if (currentMarketLoan > 0) {
      return `Loan on this market: ${formatMoney(
        currentMarketLoan
      )} (Daily: ${formatMoney(currentFreeLoan)}, Margin: ${formatMoney(
        currentMarginLoan
      )})`
    }
    return 'View loan details'
  }

  return (
    <>
      <Tooltip text={getTooltipText()} placement="top">
        <Button
          color="gray-outline"
          size="xs"
          disabled={!hasLoan}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setShowLoansModal(true)
          }}
          className={clsx('!py-1', className)}
        >
          Loan
        </Button>
      </Tooltip>

      {showLoansModal && (
        <MarketLoanModal
          user={user}
          isOpen={showLoansModal}
          setOpen={setShowLoansModal}
          contractId={contractId}
          answerId={answerId}
        />
      )}
    </>
  )
}
