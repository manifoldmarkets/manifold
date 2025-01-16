import {
  CASH_TO_MANA_CONVERSION_RATE,
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
import { TokenNumber } from 'web/components/widgets/token-number'
import toast from 'react-hot-toast'

export const CashToManaForm = (props: {
  onBack: () => void
  redeemableCash: number
}) => {
  const { redeemableCash, onBack } = props

  const roundedRedeemableCash = Math.floor(redeemableCash * 100) / 100

  const [sweepiesAmount, setSweepiesAmount] = useState<number | undefined>(
    roundedRedeemableCash
  )

  const [manaAmount, setManaAmount] = useState<number | undefined>(
    roundedRedeemableCash * CASH_TO_MANA_CONVERSION_RATE
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
  const notEnoughCashError =
    !!sweepiesAmount && sweepiesAmount > roundedRedeemableCash

  const onSubmit = async () => {
    if (!sweepiesAmount) return
    setLoading(true)
    try {
      await api('convert-cash-to-mana', {
        amount: sweepiesAmount,
      })
      setLoading(false)
      updateAmounts(sweepiesAmount, 'sweepies')
      setError(null)
      toast.success(`Successfully converted your ${SWEEPIES_NAME} to mana!`)
      onBack()
    } catch (e) {
      console.error(e)
      setError(e instanceof APIError ? e.message : 'Error converting')
      setLoading(false)
    }
  }

  return (
    <Col className="w-full shrink-0 gap-4">
      Convert at a rate of {CASH_TO_MANA_CONVERSION_RATE} {SWEEPIES_NAME} to 1
      mana.
      <Col>
        <div className="text-ink-500 text-sm">Redeem</div>
        <AmountInput
          amount={sweepiesAmount}
          onChangeAmount={(newAmount) => {
            updateAmounts(newAmount, 'sweepies')
            setActiveInput('sweepies')
          }}
          allowFloat={true}
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
          Redeem for &nbsp;
          <TokenNumber amount={sweepiesAmount} coinType="mana" isInline />
        </Button>
      </Row>
      <Row className="text-error mt-2 text-sm">{error}</Row>
    </Col>
  )
}
