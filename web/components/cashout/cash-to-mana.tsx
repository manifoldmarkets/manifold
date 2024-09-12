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
import { Col } from '../layout/col'
import { SweepiesCoin } from 'web/public/custom-components/sweepiesCoin'
import { ManaCoin } from 'web/public/custom-components/manaCoin'
import clsx from 'clsx'

export const CashToManaForm = (props: {
  onBack: () => void
  redeemableCash: number
}) => {
  // const { redeemableCash, onBack } = props
  const redeemableCash = 100
  const { onBack } = props

  const [sweepiesAmount, setSweepiesAmount] = useState<number | undefined>(
    redeemableCash
  )
  const [manaAmount, setManaAmount] = useState<number | undefined>(
    redeemableCash * CASH_TO_MANA_CONVERSION_RATE
  )
  const [activeInput, setActiveInput] = useState<'sweepies' | 'mana'>(
    'sweepies'
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const updateAmounts = (
    newAmount: number | undefined,
    type: 'sweepies' | 'mana'
  ) => {
    if (type === 'sweepies') {
      setSweepiesAmount(newAmount)
      setManaAmount(
        newAmount ? newAmount * CASH_TO_MANA_CONVERSION_RATE : undefined
      )
    } else {
      setManaAmount(newAmount)
      setSweepiesAmount(
        newAmount ? newAmount / CASH_TO_MANA_CONVERSION_RATE : undefined
      )
    }
  }
  const notEnoughCashError = !!sweepiesAmount && sweepiesAmount > redeemableCash

  const onSubmit = async () => {
    if (!manaAmount) return
    setLoading(true)
    try {
      await api('convert-cash-to-mana', {
        amount: manaAmount / CASH_TO_MANA_CONVERSION_RATE,
      })
      setLoading(false)
      updateAmounts(manaAmount, 'mana')
      setError(null)
    } catch (e) {
      console.error(e)
      setError(e instanceof APIError ? e.message : 'Error converting')
      setLoading(false)
    }
  }

  return (
    <Col className="gap-4">
      Convert at a rate of {CASH_TO_MANA_CONVERSION_RATE} {SWEEPIES_NAME} to 1
      mana.
      <Col>
        <div className="text-ink-500 text-sm">Trade</div>
        <AmountInput
          amount={sweepiesAmount}
          onChangeAmount={(newAmount) => {
            updateAmounts(newAmount, 'sweepies')
            setActiveInput('sweepies')
          }}
          isSweepies
          label={<SweepiesCoin />}
          className={activeInput === 'mana' ? 'opacity-50' : ''}
          inputClassName={clsx(
            activeInput === 'mana' ? 'cursor-pointer' : '',
            'w-full'
          )}
          onClick={() => setActiveInput('sweepies')}
        />
        <div className="h-2">
          {notEnoughCashError && (
            <div className="text-sm text-red-600 dark:text-red-400">
              You don't have enough redeemable {SWEEPIES_NAME}
            </div>
          )}
        </div>
      </Col>
      <Col>
        <div className="text-ink-500 text-sm">For</div>
        <AmountInput
          amount={manaAmount}
          onChangeAmount={(newAmount) => {
            updateAmounts(newAmount, 'mana')
            setActiveInput('mana')
          }}
          label={<ManaCoin />}
          className={activeInput === 'sweepies' ? 'opacity-50' : ''}
          inputClassName={clsx(
            activeInput === 'sweepies' ? 'cursor-pointer' : '',
            'w-full'
          )}
          onClick={() => setActiveInput('mana')}
        />
      </Col>
      <Row className=" mt-2 w-full gap-2">
        <Button color="gray" onClick={onBack}>
          Back
        </Button>
        <Button
          color="violet"
          disabled={!manaAmount || notEnoughCashError}
          loading={loading}
          onClick={onSubmit}
          className="w-full"
        >
          Convert to {ENV_CONFIG.moneyMoniker}
          {manaAmount ?? 0}
        </Button>
      </Row>
      <Row className="text-error mt-2 text-sm">{error}</Row>
    </Col>
  )
}
