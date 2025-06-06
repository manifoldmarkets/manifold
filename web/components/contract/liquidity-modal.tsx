import clsx from 'clsx'
import { type MarketContract } from 'common/contract'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useLiquidity } from 'web/hooks/use-liquidity'
import { api } from 'web/lib/api/api'
import { track } from 'web/lib/service/analytics'
import { MoneyDisplay } from '../bet/money-display'
import { Button } from '../buttons/button'
import { MODAL_CLASS, Modal } from '../layout/modal'
import { Row } from '../layout/row'
import { BuyAmountInput } from '../widgets/amount-input'
import { Title } from '../widgets/title'
import { FeedLiquidity } from 'web/components/feed/feed-liquidity'
import { InfoTooltip } from '../widgets/info-tooltip'
import { formatMoney, shortFormatNumber } from 'common/util/format'
import {
  maximumRemovableLiquidity,
  removeCpmmLiquidity,
} from 'common/calculate-cpmm'
import { isAdminId } from 'common/envs/constants'
import { useUser } from 'web/hooks/use-user'
import { APIError } from 'common/api/utils'
import { ChoicesToggleGroup } from '../widgets/choices-toggle-group'
import { floatingEqual } from 'common/util/math'

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
      <Title>Liquidity</Title>

      {lps.length > 0 ? (
        <div className="flex flex-col gap-2">
          {lps.map((lp) => (
            <FeedLiquidity
              key={lp.id}
              liquidity={lp}
              isCashContract={contract.token === 'CASH'}
              avatarSize="xs"
            />
          ))}
        </div>
      ) : (
        <NoLiquidityCopy />
      )}

      <div className="h-8" />

      <AddLiquidityControl
        contract={contract}
        amount={amount}
        setAmount={setAmount}
      />
    </Modal>
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

  return (
    <>
      {canWithdraw && (
        <ChoicesToggleGroup
          currentChoice={mode}
          setChoice={(mode) => {
            setMode(mode as 'add' | 'remove')
            if (mode === 'remove' && !amount) {
              setAmount(Math.floor(maxWithdrawable))
            }
          }}
          choicesMap={{
            'Add subsidy': 'add',
            Withdraw: 'remove',
          }}
        />
      )}
      <div className="my-4 flex flex-col gap-1">
        {contract.mechanism === 'cpmm-1' && (
          <>
            <div>
              Trickling in:{' '}
              <span className={clsx(!newTrickleQueue && 'font-semibold')}>
                {formatMoney(contract.subsidyPool, contract.token)}
              </span>
              {newTrickleQueue != undefined &&
                !floatingEqual(newTrickleQueue, contract.subsidyPool) && (
                  <>
                    <span className="text-ink-600 mx-1">&rarr;</span>
                    <span className="font-semibold">
                      {formatMoney(newTrickleQueue, contract.token)}
                    </span>
                  </>
                )}
              <InfoTooltip
                text="When you subsidize, the liquidity is added over time to prevent exploits"
                className="ml-1"
              />
            </div>
            <div>
              <span>Subsidy pool:</span>{' '}
              <span className="whitespace-nowrap">
                {shortFormatNumber(contract.pool.YES)} <span>YES</span>
                {' / '}
                {shortFormatNumber(contract.pool.NO)} <span>NO</span>
              </span>
              {newPool && (
                <>
                  <span className="text-ink-600 mx-1">&rarr;</span>

                  <span
                    className={clsx(
                      'whitespace-nowrap font-semibold',
                      aboveMax && 'text-scarlet-500'
                    )}
                  >
                    {shortFormatNumber(newPool.YES)} <span>YES</span>
                    {' / '}
                    {shortFormatNumber(newPool.NO)} <span>NO</span>
                  </span>
                </>
              )}
            </div>
          </>
        )}
        <div>
          Total liquidity:{' '}
          <span className={clsx(!amount && 'font-semibold')}>
            <MoneyDisplay
              amount={totalLiquidity}
              isCashContract={isCashContract}
            />
          </span>
          {!!amount && (
            <>
              <span className="text-ink-600 mx-1">&rarr;</span>
              <span className="font-semibold">
                <MoneyDisplay
                  amount={newTotal}
                  isCashContract={isCashContract}
                />
              </span>
            </>
          )}
        </div>
      </div>

      <Row className="mb-4">
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
      </Row>
      <Button
        onClick={submit}
        disabled={isLoading || !!error || !amount}
        color={mode === 'add' ? 'indigo' : 'yellow'}
        size="sm"
        className="mb-2 w-full"
      >
        {mode === 'add' ? 'Add liquidity' : 'Withdraw liquidity'}
      </Button>
      {isLoading && <div className="text-ink-700">Processing...</div>}
    </>
  )
}

const NoLiquidityCopy = () => (
  <div className="text-ink-600">
    {/* The higher the stakes, the more winners make!
  <br /> */}
    Add to the subsidy pool to incentivize traders to make the question
    probability more precise.
  </div>
)
