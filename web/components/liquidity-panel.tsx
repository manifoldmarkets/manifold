import clsx from 'clsx'
import { useEffect, useState } from 'react'

import { CPMMContract } from 'common/contract'
import { formatMoney } from 'common/util/format'
import { useUser } from 'web/hooks/use-user'
import { addLiquidity, withdrawLiquidity } from 'web/lib/firebase/fn-call'
import { AmountInput } from './amount-input'
import { Row } from './layout/row'
import { useUserLiquidity } from 'web/hooks/use-liquidity'
import { Tabs } from './layout/tabs'
import { NoLabel, YesLabel } from './outcome-label'
import { Col } from './layout/col'
import { InfoTooltip } from './info-tooltip'

export function LiquidityPanel(props: { contract: CPMMContract }) {
  const { contract } = props

  const user = useUser()
  const lpShares = useUserLiquidity(contract, user?.id ?? '')

  const [showWithdrawal, setShowWithdrawal] = useState(false)

  useEffect(() => {
    if (!showWithdrawal && lpShares && lpShares.YES && lpShares.NO)
      setShowWithdrawal(true)
  }, [showWithdrawal, lpShares])

  return (
    <Tabs
      tabs={[
        {
          title: 'Subsidize',
          content: <AddLiquidityPanel contract={contract} />,
        },
        ...(showWithdrawal
          ? [
              {
                title: 'Withdraw',
                content: (
                  <WithdrawLiquidityPanel
                    contract={contract}
                    lpShares={lpShares as { YES: number; NO: number }}
                  />
                ),
              },
            ]
          : []),
        {
          title: 'Pool',
          content: <ViewLiquidityPanel contract={contract} />,
        },
      ]}
    />
  )
}

function AddLiquidityPanel(props: { contract: CPMMContract }) {
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
      .catch((_) => setError('Server error'))
  }

  return (
    <>
      <div className="align-center mb-4 text-gray-500">
        Subsidize this market by adding M$ to the liquidity pool.{' '}
        <InfoTooltip text="The greater the M$ subsidy, the greater the incentive for traders to participate, the more accurate the market will be." />
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

function ViewLiquidityPanel(props: { contract: CPMMContract }) {
  const { contract } = props
  const { pool } = contract
  const { YES: yesShares, NO: noShares } = pool

  return (
    <Col className="mb-4">
      <div className="mb-4 text-gray-500">
        The liquidity pool for this market currently contains:
      </div>
      <span>
        {yesShares.toFixed(2)} <YesLabel /> shares
      </span>

      <span>
        {noShares.toFixed(2)} <NoLabel /> shares
      </span>
    </Col>
  )
}

function WithdrawLiquidityPanel(props: {
  contract: CPMMContract
  lpShares: { YES: number; NO: number }
}) {
  const { contract, lpShares } = props
  const { YES: yesShares, NO: noShares } = lpShares

  const [_error, setError] = useState<string | undefined>(undefined)
  const [isSuccess, setIsSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const submit = () => {
    setIsLoading(true)
    setIsSuccess(false)

    withdrawLiquidity({ contractId: contract.id })
      .then((_) => {
        setIsSuccess(true)
        setError(undefined)
        setIsLoading(false)
      })
      .catch((_) => setError('Server error'))
  }

  if (isSuccess)
    return (
      <div className="text-gray-500">
        Success! Your liquidity was withdrawn.
      </div>
    )

  if (!yesShares && !noShares)
    return (
      <div className="text-gray-500">
        You do not have any liquidity positions to withdraw.
      </div>
    )

  return (
    <Col>
      <div className="mb-4 text-gray-500">
        Your liquidity position is currently:
      </div>

      <span>
        {yesShares.toFixed(2)} <YesLabel /> shares
      </span>

      <span>
        {noShares.toFixed(2)} <NoLabel /> shares
      </span>

      <Row className="mt-4 mb-2">
        <button
          className={clsx(
            'btn btn-outline btn-sm ml-2',
            isLoading && 'btn-disabled'
          )}
          onClick={submit}
          disabled={isLoading}
        >
          Withdraw
        </button>
      </Row>

      {isLoading && <div>Processing...</div>}
    </Col>
  )
}
