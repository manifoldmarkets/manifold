import {
  CPMMContract,
  CPMMMultiContract,
  CPMMNumericContract,
} from 'common/contract'
import { SUBSIDY_FEE } from 'common/economy'
import { useState } from 'react'
import { api } from 'web/lib/api/api'
import { track } from 'web/lib/service/analytics'
import { MoneyDisplay } from '../bet/money-display'
import { Button } from '../buttons/button'
import { Col } from '../layout/col'
import { Modal } from '../layout/modal'
import { Row } from '../layout/row'
import { BuyAmountInput } from '../widgets/amount-input'
import { Title } from '../widgets/title'

export function LiquidityModal(props: {
  contract: CPMMContract | CPMMMultiContract | CPMMNumericContract
  isOpen: boolean
  setOpen: (open: boolean) => void
}) {
  const { contract, isOpen, setOpen } = props
  const [amount, setAmount] = useState<number | undefined>(undefined)

  return (
    <Modal open={isOpen} setOpen={setOpen} size="md">
      <Col className="bg-canvas-0 gap-3  rounded p-4 pb-8 sm:gap-4">
        <Title className="!mb-2">💧 Subsidize this market</Title>

        <AddLiquidityPanel
          contract={contract}
          amount={amount}
          setAmount={setAmount}
        />
      </Col>
    </Modal>
  )
}

export function AddLiquidityPanel(props: {
  contract: CPMMContract | CPMMMultiContract | CPMMNumericContract
  amount: number | undefined
  setAmount: (amount: number | undefined) => void
}) {
  const { contract, amount, setAmount } = props
  const { id: contractId, slug, totalLiquidity } = contract

  const [error, setError] = useState<string | undefined>(undefined)
  const [isSuccess, setIsSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const payAmount = Math.ceil((1 / (1 - SUBSIDY_FEE)) * (amount ?? 0))
  const isCashContract = contract.token === 'CASH'

  const submit = async () => {
    if (!amount) return

    setIsLoading(true)
    setIsSuccess(false)

    try {
      await api('market/:contractId/add-liquidity', {
        amount: payAmount,
        contractId,
      })
      setAmount(undefined)
      setIsSuccess(true)
      setError(undefined)
      track('add liquidity', { amount, contractId, slug })
    } catch (e) {
      setError('Server error')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Col className="w-full">
      <div className="text-ink-600">
        {/* The higher the stakes, the more winners make!
        <br /> */}
        Add to the subsidy pool to incentivize traders to make the question
        probability more precise.
      </div>

      <div className="my-4">
        Total subsidy pool:{' '}
        <span className="font-semibold">
          <MoneyDisplay
            amount={totalLiquidity}
            isCashContract={isCashContract}
          />
        </span>
      </div>

      <Row className="mb-4">
        <BuyAmountInput
          amount={amount}
          onChange={setAmount}
          error={error}
          setError={setError}
          disabled={false}
          quickButtonValues="large"
          token={isCashContract ? 'CASH' : 'M$'}
        />
      </Row>
      <Button
        onClick={submit}
        disabled={isLoading || !!error || !amount}
        size="sm"
        className="mb-2"
      >
        Subsidize
      </Button>

      {isSuccess && amount && (
        <div className="text-center">
          Success! Added{' '}
          <MoneyDisplay amount={amount} isCashContract={isCashContract} />{' '}
          subsidy.
        </div>
      )}

      {isLoading && <div>Processing...</div>}
    </Col>
  )
}
