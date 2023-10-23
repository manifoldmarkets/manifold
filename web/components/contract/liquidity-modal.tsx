import { CPMMContract, CPMMMultiContract } from 'common/contract'
import { formatMoney, formatPercent } from 'common/util/format'
import { useState } from 'react'
import { addSubsidy } from 'web/lib/firebase/api'
import { track } from 'web/lib/service/analytics'
import { BuyAmountInput } from '../widgets/amount-input'
import { Button } from '../buttons/button'
import { Col } from '../layout/col'
import { Modal } from '../layout/modal'
import { Title } from '../widgets/title'
import { SUBSIDY_FEE } from 'common/economy'
import { Row } from '../layout/row'

export function LiquidityModal(props: {
  contract: CPMMContract | CPMMMultiContract
  isOpen: boolean
  setOpen: (open: boolean) => void
}) {
  const { contract, isOpen, setOpen } = props
  const { totalLiquidity } = contract

  return (
    <Modal open={isOpen} setOpen={setOpen} size="md">
      <Col className="bg-canvas-0 gap-3  rounded p-4 pb-8 sm:gap-4">
        <Title className="!mb-2">💧 Subsidize this market</Title>

        <div className="text-ink-600">
          The higher the stakes, the more winners make!
          <br />
          Pay traders to make the probability more precise.
        </div>
        <div>
          <div className="mb-2">
            Total subsidy pool:{' '}
            <span className="font-semibold">{formatMoney(totalLiquidity)}</span>
          </div>
          <AddLiquidityPanel contract={contract} />
        </div>
      </Col>
    </Modal>
  )
}

function AddLiquidityPanel(props: {
  contract: CPMMContract | CPMMMultiContract
}) {
  const { contract } = props
  const { id: contractId, slug } = contract

  const [amount, setAmount] = useState<number | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [isSuccess, setIsSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const onAmountChange = (amount: number | undefined) => {
    setIsSuccess(false)
    setAmount(amount)
  }

  const payAmount = Math.ceil((1 / (1 - SUBSIDY_FEE)) * (amount ?? 0))

  const submit = () => {
    if (!amount) return

    setIsLoading(true)
    setIsSuccess(false)

    addSubsidy({ amount: payAmount, contractId })
      .then((_) => {
        setIsSuccess(true)
        setError(undefined)
        setIsLoading(false)
      })
      .catch((_) => setError('Server error'))

    track('add liquidity', { amount, contractId, slug })
  }

  return (
    <Col className="w-full">
      <Row className="mb-4">
        <BuyAmountInput
          inputClassName="w-40 mr-2"
          amount={amount}
          onChange={onAmountChange}
          error={error}
          setError={setError}
          disabled={isLoading}
          // don't use slider: useless for larger amounts
          sliderOptions={{ show: false, wrap: false }}
        />

        <Button
          onClick={submit}
          disabled={isLoading || !!error || !amount}
          size="sm"
        >
          Subsidize
        </Button>
      </Row>

      {amount ? (
        <div className="text-ink-700 text-xs">
          Pay {formatMoney(payAmount)} to add {formatMoney(amount)} to the
          subsidy pool after fees.
        </div>
      ) : (
        <div className="text-ink-700 text-xs">
          Note: Manifold charges a {formatPercent(SUBSIDY_FEE)} fee on
          subsidies.
        </div>
      )}

      {isSuccess && amount && (
        <div>
          Success! Added {formatMoney(amount)} to the subsidy pool, after fees.
        </div>
      )}

      {isLoading && <div>Processing...</div>}
    </Col>
  )
}
