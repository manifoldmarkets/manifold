import {
  CASH_TO_MANA_CONVERSION_RATE,
  ENV_CONFIG,
  SWEEPIES_NAME,
} from 'common/envs/constants'
import { useState } from 'react'
import { APIError, api } from 'web/lib/api/api'
import { Button } from '../buttons/button'
import { Row } from '../layout/row'
import { AmountInput } from '../widgets/amount-input'

export const CashToManaForm = (props: {
  onBack: () => void
  redeemableCash: number
}) => {
  const { redeemableCash, onBack } = props
  const [amount, setAmount] = useState<number | undefined>(
    redeemableCash * CASH_TO_MANA_CONVERSION_RATE
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async () => {
    if (!amount) return
    setLoading(true)
    try {
      await api('convert-cash-to-mana', {
        amount: amount / CASH_TO_MANA_CONVERSION_RATE,
      })
      setLoading(false)
      setAmount(amount)
      setError(null)
    } catch (e) {
      console.error(e)
      setError(e instanceof APIError ? e.message : 'Error converting')
      setLoading(false)
    }
  }

  return (
    <>
      <div className="my-4">
        Convert at a rate of {CASH_TO_MANA_CONVERSION_RATE} {SWEEPIES_NAME} to 1
        mana.
      </div>
      <div className="text-ink-500 mb-2 text-sm">Amount</div>
      <AmountInput amount={amount} onChangeAmount={setAmount} />
      <div className="mt-4 flex gap-2">
        <Button color="gray" onClick={onBack}>
          Back
        </Button>
        <Button
          color="gradient"
          disabled={!amount}
          loading={loading}
          onClick={onSubmit}
        >
          Convert to {ENV_CONFIG.moneyMoniker}
          {amount}
        </Button>
      </div>
      <Row className="text-error mt-2 text-sm">{error}</Row>
    </>
  )
}
