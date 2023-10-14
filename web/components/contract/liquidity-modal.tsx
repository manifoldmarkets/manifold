import { CPMMContract, CPMMMultiContract } from 'common/contract'
import { formatMoney, formatPercent } from 'common/util/format'
import { useState } from 'react'
import { useUser } from 'web/hooks/use-user'
import { addSubsidy } from 'web/lib/firebase/api'
import { track } from 'web/lib/service/analytics'
import { AmountInput } from '../widgets/amount-input'
import { Button } from '../buttons/button'
import { Col } from '../layout/col'
import { Modal } from '../layout/modal'
import { Row } from '../layout/row'
import { Title } from '../widgets/title'
import { ENV_CONFIG } from 'common/envs/constants'
import { InfoTooltip } from '../widgets/info-tooltip'
import { SUBSIDY_FEE } from 'common/economy'

export function LiquidityModal(props: {
  contract: CPMMContract | CPMMMultiContract
  isOpen: boolean
  setOpen: (open: boolean) => void
}) {
  const { contract, isOpen, setOpen } = props
  const { totalLiquidity } = contract

  return (
    <Modal open={isOpen} setOpen={setOpen} size="md">
      <Col className="bg-canvas-0 gap-2.5  rounded p-4 pb-8 sm:gap-4">
        <Title className="!mb-2">💧 Subsidize this market</Title>

        <div className="text-ink-600 text-lg italic">
          The higher the stakes, the more winners make.
        </div>
        <div>
          Pay traders to answer your question! Subsidies incentivize traders to
          make the probability accurate.
        </div>
        <div className="mb-4">
          Total subsidy pool:{' '}
          <span className="font-semibold">{formatMoney(totalLiquidity)}</span>
        </div>
        <AddLiquidityPanel contract={contract} />
      </Col>
    </Modal>
  )
}

function AddLiquidityPanel(props: {
  contract: CPMMContract | CPMMMultiContract
}) {
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

    addSubsidy({ amount, contractId })
      .then((_) => {
        setIsSuccess(true)
        setError(undefined)
        setIsLoading(false)
      })
      .catch((_) => setError('Server error'))

    track('add liquidity', { amount, contractId, slug })
  }

  return (
    <>
      <Row>
        <AmountInput
          amount={amount}
          onChangeAmount={onAmountChange}
          label={ENV_CONFIG.moneyMoniker}
          error={!!error}
          disabled={isLoading}
          inputClassName="w-32 mr-4"
        />
        <Button onClick={submit} disabled={isLoading || !!error}>
          Pay
        </Button>
      </Row>

      <div className="text-ink-600 text-xs">
        Note: Manifold charges a {formatPercent(SUBSIDY_FEE)} fee on subsidies.
      </div>

      {error && <div className="text-error">{error}</div>}

      {isSuccess && amount && (
        <div>
          Success! Added {formatMoney((1 - SUBSIDY_FEE) * amount)} to the
          subsidy pool, after fees.
        </div>
      )}

      {isLoading && <div>Processing...</div>}
    </>
  )
}
