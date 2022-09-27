import { Contract } from 'common/contract'
import { useUser } from 'web/hooks/use-user'
import { useState } from 'react'
import { addCommentBounty } from 'web/lib/firebase/api'
import { track } from 'web/lib/service/analytics'
import { InfoTooltip } from 'web/components/info-tooltip'
import { BETTORS, PRESENT_BET } from 'common/user'
import { Row } from 'web/components/layout/row'
import { AmountInput } from 'web/components/amount-input'
import clsx from 'clsx'
import { formatMoney } from 'common/util/format'

export function AddCommentBountyPanel(props: { contract: Contract }) {
  const { contract } = props
  const { id: contractId, slug } = contract

  const user = useUser()

  const [amount, setAmount] = useState<number | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [isSuccess, setIsSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const onAmountChange = (amount: number | undefined) => {
    setIsSuccess(false)
    setAmount(amount)

    // Check for errors.
    if (amount !== undefined) {
      if (user && user.balance < amount) {
        setError('Insufficient balance')
      } else if (amount < 1) {
        setError('Minimum amount: ' + formatMoney(1))
      } else {
        setError(undefined)
      }
    }
  }

  const submit = () => {
    if (!amount) return

    setIsLoading(true)
    setIsSuccess(false)

    addCommentBounty({ amount, contractId })
      .then((_) => {
        setIsSuccess(true)
        setError(undefined)
        setIsLoading(false)
      })
      .catch((_) => setError('Server error'))

    track('add comment bounty', { amount, contractId, slug })
  }

  return (
    <>
      <div className="mb-4 text-gray-500">
        Contribute your M$ to make this market more accurate.{' '}
        <InfoTooltip
          text={`More liquidity stabilizes the market, encouraging ${BETTORS} to ${PRESENT_BET}. You can withdraw your subsidy at any time.`}
        />
      </div>

      <Row>
        <AmountInput
          amount={amount}
          onChange={onAmountChange}
          label="M$"
          error={error}
          disabled={isLoading}
          inputClassName="w-28"
        />
        <button
          className={clsx('btn btn-primary ml-2', isLoading && 'btn-disabled')}
          onClick={submit}
          disabled={isLoading}
        >
          Add
        </button>
      </Row>

      {isSuccess && amount && (
        <div>Success! Added {formatMoney(amount)} in bounties.</div>
      )}

      {isLoading && <div>Processing...</div>}
    </>
  )
}
