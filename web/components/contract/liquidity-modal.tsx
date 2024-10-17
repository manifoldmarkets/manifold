import clsx from 'clsx'
import { type MarketContract } from 'common/contract'
import { SUBSIDY_FEE } from 'common/economy'
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
import { formatMoney } from 'common/util/format'

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

      <div className="h-4" />

      {contract.mechanism === 'cpmm-1' && contract.subsidyPool > 0 && (
        <div>
          Trickling in:{' '}
          <span className="font-semibold">
            {formatMoney(contract.subsidyPool, contract.token)}
          </span>{' '}
          <InfoTooltip text="When you subsidize, the liquidity is added over time to prevent exploits" />
        </div>
      )}

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

  const payAmount = Math.ceil((1 / (1 - SUBSIDY_FEE)) * (amount ?? 0))
  const isCashContract = contract.token === 'CASH'

  const submit = async () => {
    if (!amount) return

    setIsLoading(true)

    try {
      await api('market/:contractId/add-liquidity', {
        amount: payAmount,
        contractId,
      })
      toast.success(
        <>
          Success! Added{' '}
          <MoneyDisplay amount={amount} isCashContract={isCashContract} />{' '}
          subsidy.
        </>
      )
      setAmount(undefined)
      setError(undefined)
      track('add liquidity', { amount, contractId, slug })
    } catch (e) {
      setError('Server error')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <div className="my-4">
        Total subsidy pool:{' '}
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
                amount={totalLiquidity + amount}
                isCashContract={isCashContract}
              />
            </span>
          </>
        )}
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
        className="mb-2 w-full"
      >
        Subsidize
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
