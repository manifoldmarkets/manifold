import clsx from 'clsx'
import { useEffect, useState } from 'react'

import { Contract, CPMMContract } from 'common/contract'
import { formatMoney } from 'common/util/format'
import { useUser } from 'web/hooks/use-user'
import { addLiquidity, withdrawLiquidity } from 'web/lib/firebase/api'
import { AmountInput } from 'web/components/amount-input'
import { Row } from 'web/components/layout/row'
import { useUserLiquidity } from 'web/hooks/use-liquidity'
import { Tabs } from 'web/components/layout/tabs'
import { NoLabel, YesLabel } from 'web/components/outcome-label'
import { Col } from 'web/components/layout/col'
import { track } from 'web/lib/service/analytics'
import { InfoTooltip } from 'web/components/info-tooltip'
import { BETTORS, PRESENT_BET } from 'common/user'
import { buildArray } from 'common/util/array'
import { useAdmin } from 'web/hooks/use-admin'
import { AlertBox } from '../alert-box'
import { Spacer } from '../layout/spacer'

export function LiquidityBountyPanel(props: { contract: Contract }) {
  const { contract } = props

  const isCPMM = contract.mechanism === 'cpmm-1'
  const user = useUser()
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const lpShares = isCPMM && useUserLiquidity(contract, user?.id ?? '')

  const [showWithdrawal, setShowWithdrawal] = useState(false)

  useEffect(() => {
    if (!showWithdrawal && lpShares && lpShares.YES && lpShares.NO)
      setShowWithdrawal(true)
  }, [showWithdrawal, lpShares])

  const isCreator = user?.id === contract.creatorId
  const isAdmin = useAdmin()

  if (!isCreator && !isAdmin && !showWithdrawal) return <></>

  return (
    <Tabs
      tabs={buildArray(
        (isCreator || isAdmin) &&
          isCPMM && {
            title: (isAdmin ? '[Admin] ' : '') + 'Subsidize',
            content: <AddLiquidityPanel contract={contract} />,
          },
        showWithdrawal &&
          isCPMM && {
            title: 'Withdraw',
            content: (
              <WithdrawLiquidityPanel
                contract={contract}
                lpShares={lpShares as { YES: number; NO: number }}
              />
            ),
          },

        (isCreator || isAdmin) &&
          isCPMM && {
            title: 'Pool',
            content: <ViewLiquidityPanel contract={contract} />,
          }
      )}
    />
  )
}

function AddLiquidityPanel(props: { contract: CPMMContract }) {
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

    addLiquidity({ amount, contractId })
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
      <div className="mb-4 text-gray-500">
        Contribute your M$ to make this market more accurate.{' '}
        <InfoTooltip
          text={`More liquidity stabilizes the market, encouraging ${BETTORS} to ${PRESENT_BET}.`}
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
        <div>Success! Added {formatMoney(amount)} in liquidity.</div>
      )}

      {isLoading && <div>Processing...</div>}

      <Spacer h={2} />
      <AlertBox
        title="Withdrawals ending"
        text="Manifold is moving to a new system for handling subsidization. As part of this process, liquidity withdrawals will be disabled shortly. Feel free to withdraw any outstanding liquidity you've added now."
      />
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

    track('withdraw liquidity')
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
