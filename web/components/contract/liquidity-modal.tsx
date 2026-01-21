import clsx from 'clsx'
import { APIError } from 'common/api/utils'
import {
  maximumRemovableLiquidity,
  removeCpmmLiquidity,
} from 'common/calculate-cpmm'
import { type MarketContract } from 'common/contract'
import { isAdminId } from 'common/envs/constants'
import { formatMoney, formatWithCommas } from 'common/util/format'
import { floatingEqual } from 'common/util/math'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { FeedLiquidity } from 'web/components/feed/feed-liquidity'
import { useLiquidity } from 'web/hooks/use-liquidity'
import { useUser } from 'web/hooks/use-user'
import { api } from 'web/lib/api/api'
import { track } from 'web/lib/service/analytics'
import { MoneyDisplay } from '../bet/money-display'
import { Button } from '../buttons/button'
import { MODAL_CLASS, Modal } from '../layout/modal'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { BuyAmountInput } from '../widgets/amount-input'
import { InfoTooltip } from '../widgets/info-tooltip'

export function AddLiquidityModal(props: {
  contract: MarketContract
  isOpen: boolean
  setOpen: (open: boolean) => void
}) {
  const { contract, isOpen, setOpen } = props

  const lps = useLiquidity(contract.id) ?? []

  const [amount, setAmount] = useState<number | undefined>(0)

  return (
    <Modal open={isOpen} setOpen={setOpen} size="sm" className={MODAL_CLASS}>
      <Col className="gap-6">
        {/* Header */}
        <div>
          <h2 className="text-primary-700 text-2xl font-semibold tracking-tight">
            Liquidity
          </h2>
          <p className="text-ink-500 mt-1 text-sm">
            Subsidize this market to incentivize more accurate predictions
          </p>
        </div>

        {/* Stats Section */}
        <LiquidityStats contract={contract} />

        {/* Action Section */}
        <AddLiquidityControl
          contract={contract}
          amount={amount}
          setAmount={setAmount}
        />

        {/* Contributors Section */}
        {lps.length > 0 && (
          <div>
            <div className="text-ink-600 mb-2 text-xs font-medium uppercase tracking-wide">
              Contributors
            </div>
            <div className="bg-canvas-50 divide-ink-200 divide-y rounded-lg border">
              {lps.map((lp) => (
                <div key={lp.id} className="px-3 py-2.5">
                  <FeedLiquidity
                    liquidity={lp}
                    isCashContract={contract.token === 'CASH'}
                    avatarSize="xs"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </Col>
    </Modal>
  )
}

function LiquidityStats(props: { contract: MarketContract }) {
  const { contract } = props
  const isCashContract = contract.token === 'CASH'

  // Calculate drizzled amount (total minus pending)
  const drizzled =
    contract.mechanism === 'cpmm-1'
      ? contract.totalLiquidity - contract.subsidyPool
      : contract.totalLiquidity

  return (
    <Row className="bg-canvas-50 text-ink-600 flex-wrap gap-x-6 gap-y-2 rounded-lg border px-4 py-3 text-sm">
      <Row className="items-center gap-1.5">
        <span className="text-ink-500">Liquidity:</span>
        <span className="text-ink-900 font-medium">
          <MoneyDisplay amount={drizzled} isCashContract={isCashContract} />
          {' / '}
          <MoneyDisplay
            amount={contract.totalLiquidity}
            isCashContract={isCashContract}
          />
        </span>
        <InfoTooltip
          text="Subsidies trickle in over time to prevent manipulation. Shows active / total liquidity."
          size="sm"
        />
      </Row>
      {contract.mechanism === 'cpmm-1' && (
        <Row className="items-center gap-1.5">
          <span className="text-ink-500">Pool:</span>
          <span className="text-ink-900 font-medium">
            {formatWithCommas(Math.round(contract.pool.YES))} YES,{' '}
            {formatWithCommas(Math.round(contract.pool.NO))} NO shares
          </span>
        </Row>
      )}
    </Row>
  )
}

export function AddLiquidityControl(props: {
  contract: MarketContract
  amount: number | undefined
  setAmount: (amount: number | undefined) => void
}) {
  const { contract, amount, setAmount } = props
  const { id: contractId, slug, totalLiquidity } = contract

  const [error, setError] = useState<string | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(false)

  const user = useUser()
  const contractOpenAndPublic =
    !contract.isResolved &&
    (contract.closeTime ?? Infinity) > Date.now() &&
    contract.visibility == 'public'

  const addLiquidityEnabled =
    user &&
    (contract.mechanism == 'cpmm-1' || contract.mechanism == 'cpmm-multi-1') &&
    contractOpenAndPublic
  const [mode, setMode] = useState<'add' | 'remove'>('add')
  const canWithdraw =
    contract.mechanism === 'cpmm-1' &&
    !!user &&
    ((user.id === contract.creatorId && contract.token !== 'CASH') ||
      isAdminId(user.id))
  const maxWithdrawable = !canWithdraw
    ? 0
    : contract.subsidyPool + maximumRemovableLiquidity(contract.pool)
  const aboveMax = mode === 'remove' && amount && amount > maxWithdrawable
  const newTotal = totalLiquidity + (amount ?? 0) * (mode === 'add' ? 1 : -1)

  const newTrickleQueue = !amount
    ? undefined
    : Math.max(0, contract.subsidyPool + amount * (mode === 'add' ? 1 : -1))

  const newPool =
    contract.mechanism === 'cpmm-1' && mode === 'remove' && !!amount
      ? amount > contract.subsidyPool &&
        removeCpmmLiquidity(
          contract.pool,
          contract.p,
          amount - contract.subsidyPool
        ).newPool
      : undefined

  const isCashContract = contract.token === 'CASH'

  const submit = async () => {
    if (!amount) return

    setIsLoading(true)

    try {
      if (mode === 'add') {
        await api('market/:contractId/add-liquidity', {
          amount,
          contractId,
        })
        toast.success(
          <>
            Success! Added{' '}
            <MoneyDisplay amount={amount} isCashContract={isCashContract} />{' '}
            subsidy.
          </>
        )
      } else {
        await api('market/:contractId/remove-liquidity', {
          amount,
          contractId,
        })
        toast.success(
          <>
            Success! Withdrew{' '}
            <MoneyDisplay amount={amount} isCashContract={isCashContract} />{' '}
            subsidy.
          </>
        )
      }

      setAmount(undefined)
      setError(undefined)
      if (mode === 'add') {
        track('add liquidity', { amount, contractId, slug })
      } else {
        track('remove liquidity', { amount, contractId, slug })
      }
    } catch (e) {
      if (e instanceof APIError) {
        setError(e.message)
      } else {
        setError('Server error')
      }
    } finally {
      setIsLoading(false)
    }
  }

  if (!addLiquidityEnabled) return null

  const hasChanges = !!amount && amount > 0

  return (
    <Col className="gap-4">
      {/* Mode Toggle */}
      {canWithdraw && (
        <div className="bg-canvas-50 inline-flex self-start rounded-lg p-1">
          <button
            onClick={() => setMode('add')}
            className={clsx(
              'rounded-md px-4 py-1.5 text-sm font-medium transition-all',
              mode === 'add'
                ? 'bg-canvas-0 text-ink-900 shadow-sm'
                : 'text-ink-500 hover:text-ink-700'
            )}
          >
            Add
          </button>
          <button
            onClick={() => {
              setMode('remove')
              if (!amount) setAmount(Math.floor(maxWithdrawable))
            }}
            className={clsx(
              'rounded-md px-4 py-1.5 text-sm font-medium transition-all',
              mode === 'remove'
                ? 'bg-canvas-0 text-ink-900 shadow-sm'
                : 'text-ink-500 hover:text-ink-700'
            )}
          >
            Withdraw
          </button>
        </div>
      )}

      {/* Amount Input */}
      <div>
        <BuyAmountInput
          amount={amount}
          onChange={setAmount}
          error={error}
          setError={setError}
          disabled={false}
          quickButtonAmountSize="large"
          token={isCashContract ? 'CASH' : 'M$'}
          disregardUserBalance={mode === 'remove'}
          maximumAmount={mode === 'remove' ? maxWithdrawable : undefined}
        />
      </div>

      {/* Preview Changes */}
      {hasChanges && contract.mechanism === 'cpmm-1' && (
        <div className="bg-canvas-50 rounded-lg border px-4 py-3">
          <div className="text-ink-600 mb-2 text-xs font-medium uppercase tracking-wide">
            Preview
          </div>
          <div className="space-y-1.5 text-sm">
            <PreviewRow
              label="Total liquidity"
              from={
                <MoneyDisplay
                  amount={totalLiquidity}
                  isCashContract={isCashContract}
                />
              }
              to={
                <MoneyDisplay
                  amount={newTotal}
                  isCashContract={isCashContract}
                />
              }
            />
            {newTrickleQueue != undefined &&
              !floatingEqual(newTrickleQueue, contract.subsidyPool) && (
                <PreviewRow
                  label="Pending subsidy"
                  from={
                    <MoneyDisplay
                      amount={contract.subsidyPool}
                      isCashContract={isCashContract}
                    />
                  }
                  to={
                    <MoneyDisplay
                      amount={newTrickleQueue}
                      isCashContract={isCashContract}
                    />
                  }
                />
              )}
            {newPool && (
              <PreviewRow
                label="Pool"
                from={
                  <>
                    {formatWithCommas(Math.round(contract.pool.YES))} /{' '}
                    {formatWithCommas(Math.round(contract.pool.NO))}
                  </>
                }
                to={
                  <span className={clsx(aboveMax && 'text-scarlet-500')}>
                    {formatWithCommas(Math.round(newPool.YES))} /{' '}
                    {formatWithCommas(Math.round(newPool.NO))}
                  </span>
                }
              />
            )}
          </div>
        </div>
      )}

      {/* Submit Button */}
      <Button
        onClick={submit}
        disabled={isLoading || !!error || !amount}
        loading={isLoading}
        color={mode === 'add' ? 'indigo' : 'yellow'}
        size="xl"
        className="w-full"
      >
        {mode === 'add' ? 'Add liquidity' : 'Withdraw liquidity'}
      </Button>
    </Col>
  )
}

function PreviewRow(props: {
  label: string
  from: React.ReactNode
  to: React.ReactNode
}) {
  const { label, from, to } = props
  return (
    <Row className="items-center justify-between">
      <span className="text-ink-500">{label}</span>
      <Row className="items-center gap-2">
        <span className="text-ink-400">{from}</span>
        <span className="text-ink-400">&rarr;</span>
        <span className="text-ink-900 font-medium">{to}</span>
      </Row>
    </Row>
  )
}
