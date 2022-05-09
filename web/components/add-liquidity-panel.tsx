import clsx from 'clsx'
import { useState } from 'react'

import { Contract } from 'common/contract'
import { formatMoney } from 'common/util/format'
import { useUser } from '../hooks/use-user'
import { addLiquidity } from 'web/lib/firebase/api-call'
import { AmountInput } from './amount-input'
import { Row } from './layout/row'

export function AddLiquidityPanel(props: { contract: Contract }) {
  const { contract } = props
  const { id: contractId } = contract

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

    addLiquidity({ amount, contractId })
      .then((r) => {
        if (r.status === 'success') {
          setIsSuccess(true)
          setError(undefined)
          setIsLoading(false)
        } else {
          setError('Server error')
        }
      })
      .catch((e) => setError('Server error'))
  }

  return (
    <>
      <div className="text-gray-500">
        Subsidize this market by adding liquidity for traders.
      </div>

      <Row>
        <AmountInput
          amount={amount}
          onChange={onAmountChange}
          label="M$"
          error={error}
          disabled={isLoading}
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
        <div>Success! Added {formatMoney(amount)} in liquidity.</div>
      )}

      {isLoading && <div>Processing...</div>}
    </>
  )
}
