import { User } from 'common/user'
import { useState } from 'react'
import { api, APIError } from 'web/lib/api/api'
import { Col } from '../layout/col'
import { Button } from '../buttons/button'
import { Row } from '../layout/row'
import { CoinNumber } from '../widgets/coin-number'
import {
  CASH_TO_MANA_CONVERSION_RATE,
  ENV_CONFIG,
  SWEEPIES_NAME,
} from 'common/envs/constants'
import { AmountInput } from '../widgets/amount-input'

export function AllCashToManaButton(props: {
  user: User
  disableAllButtons: boolean
  setDisableAllButtons: (disabled: boolean) => void
  redeemableCash: number
  disabled: boolean
}) {
  const {
    user,
    disableAllButtons,
    setDisableAllButtons,
    redeemableCash,
    disabled,
  } = props
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const spiceBalance = user.spiceBalance
  const onSubmit = async () => {
    if (!spiceBalance) return
    setLoading(true)
    setDisableAllButtons(true)
    try {
      // TWODO: Implement sweepies to mana
      throw new Error('This function has not been implemented yet.')
      setLoading(false)
      setError(null)
      setDisableAllButtons(false)
    } catch (e) {
      console.error(e)
      setError(e instanceof APIError ? e.message : 'Error converting')
      setLoading(false)
      setDisableAllButtons(false)
    }
  }
  return (
    <Col className="w-1/2 gap-0.5">
      <Button
        onClick={onSubmit}
        size="xs"
        className="w-full whitespace-nowrap text-xs sm:text-sm"
        loading={loading}
        disabled={disableAllButtons || disabled}
        color="violet"
      >
        Redeem all for mana
      </Button>
      {!error && (
        <Row className="text-ink-500 w-full justify-end gap-1 whitespace-nowrap text-xs sm:text-sm ">
          <CoinNumber
            amount={user.spiceBalance * CASH_TO_MANA_CONVERSION_RATE}
            className="font-semibold text-violet-600 dark:text-violet-400"
          />
          mana value
        </Row>
      )}
      {!!error && (
        <Row className="text-scarlet-700 w-full justify-end gap-1 whitespace-nowrap  text-xs sm:text-sm">
          {error}
        </Row>
      )}
    </Col>
  )
}

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
      // TWODO: Implement sweepies to mana
      throw new Error('This function has not been implemented yet.')
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
        <Button color="gray" onClick={props.onBack}>
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
