import { Contract } from 'common/contract'
import { formatMoney, formatWithCommas } from 'common/util/format'
import { AmountInput, BuyAmountInput } from '../widgets/amount-input'
import { ReactNode, useState } from 'react'
import { api, boostMarket, getAdAnalytics } from 'web/lib/firebase/api'
import { Button } from '../buttons/button'
import toast from 'react-hot-toast'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { DEFAULT_AD_COST_PER_VIEW, MIN_AD_COST_PER_VIEW } from 'common/boost'
import { Table } from '../widgets/table'
import { Modal } from '../layout/modal'
import { Col } from '../layout/col'
import { Title } from '../widgets/title'
import { Row } from '../layout/row'
import { ENV_CONFIG } from 'common/envs/constants'
import { InfoTooltip } from '../widgets/info-tooltip'
import { track } from 'web/lib/service/analytics'
import { useQuery } from 'web/hooks/use-query'
import { TbRocket } from 'react-icons/tb'
import clsx from 'clsx'
import { ControlledTabs } from '../layout/tabs'
import { AddLiquidityPanel } from './liquidity-modal'
import { buildArray } from 'common/util/array'
import { ShowMoreLessButton } from '../widgets/collapsible-content'
import { SUBSIDY_FEE } from 'common/economy'
import { APISchema } from 'common/api/schema'

export function BoostButton(props: { contract: Contract; className?: string }) {
  const { contract, className } = props
  const [open, setOpen] = useState(false)

  const disabled =
    contract.isResolved ||
    (contract.closeTime ?? Infinity) < Date.now() ||
    contract.visibility !== 'public'

  if (disabled) return <></>

  return (
    <Button
      onClick={() => setOpen(true)}
      size="lg"
      color="indigo-outline"
      className={clsx(className, 'group')}
    >
      <TbRocket className="fill-scarlet-300 stroke-scarlet-600 mr-1 h-5 w-5 group-hover:stroke-current" />
      Boost
      <BoostDialog contract={contract} isOpen={open} setOpen={setOpen} />
    </Button>
  )
}

export function BoostDialog(props: {
  contract: Contract
  isOpen: boolean
  setOpen: (open: boolean) => void
}) {
  const { contract, isOpen, setOpen } = props

  const [index, setIndex] = useState(0)
  const [showTabs, setShowTabs] = useState(false)

  const [amount, setAmount] = useState<number | undefined>(200)

  const subsidyDisabled =
    contract.isResolved ||
    (contract.closeTime ?? Infinity) < Date.now() ||
    (contract.mechanism !== 'cpmm-1' && contract.mechanism !== 'cpmm-multi-1')

  return (
    <Modal open={isOpen} setOpen={setOpen} size="sm">
      <Col className="bg-canvas-0 gap-2.5  rounded p-4 pb-8 sm:gap-4">
        <Title className="!mb-2">🚀 Boost this question</Title>

        {!showTabs && (
          <SimpleBoostRow
            contract={contract}
            subsidyDisabled={subsidyDisabled}
            amount={amount}
            setAmount={setAmount}
          />
        )}

        <ShowMoreLessButton
          onClick={() => setShowTabs(!showTabs)}
          isCollapsed={!showTabs}
        />

        {showTabs && (
          <ControlledTabs
            tabs={buildArray(
              {
                title: 'Feed promo',
                content: (
                  <BoostFormRow
                    contract={contract}
                    amount={amount}
                    setAmount={setAmount}
                  />
                ),
              },
              !subsidyDisabled && {
                title: 'Subsidies',
                content: (
                  <AddLiquidityPanel
                    contract={contract}
                    amount={amount}
                    setAmount={setAmount}
                  />
                ),
              },
              {
                title: 'Analytics',
                content: <FeedAnalytics contractId={contract.id} />,
              }
            )}
            activeIndex={index}
            onClick={(_, i) => setIndex(i)}
            trackingName="boost tabs"
          />
        )}
      </Col>
    </Modal>
  )
}

function SimpleBoostRow(props: {
  contract: Contract
  subsidyDisabled: boolean
  amount: number | undefined
  setAmount: (amount: number | undefined) => void
}) {
  const { contract, subsidyDisabled, amount, setAmount } = props
  const { id: contractId, slug } = contract

  const [error, setError] = useState<string | undefined>(undefined)
  const [success, setSuccess] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const onAmountChange = (amount: number | undefined) => {
    setSuccess('')
    setAmount(amount)
  }

  const clickAmount = subsidyDisabled ? amount ?? 0 : 0.5 * (amount ?? 0)
  const numClicks = Math.floor(clickAmount / DEFAULT_AD_COST_PER_VIEW)
  const subsidyAmount = (amount ?? 0) - numClicks * DEFAULT_AD_COST_PER_VIEW

  const submit = async () => {
    if (!amount) return

    setIsLoading(true)
    setSuccess('')
    setError(undefined)

    if (subsidyDisabled && numClicks < 1) {
      setError(`Boost at least ${formatMoney(10)}`)
      return
    }

    if (numClicks >= 1)
      await boostMarket({
        marketId: contract.id,
        totalCost: numClicks * DEFAULT_AD_COST_PER_VIEW,
        costPerView: DEFAULT_AD_COST_PER_VIEW,
      })

    if (!subsidyDisabled) {
      await api('market/:contractId/add-liquidity', {
        amount: subsidyAmount,
        contractId,
      })

      // setSuccess(
      //   `Boosted! You purchased ${numClicks} feed click${
      //     numClicks > 1 ? 's' : ''
      //   } and added ${formatMoney(
      //     (1 - SUBSIDY_FEE) * subsidyAmount
      //   )} to the subsidy pool.`
      // )
    }

    setSuccess(`Boosted by ${formatMoney(amount)}!`)

    setError(undefined)
    setIsLoading(false)

    track('simple boost', { amount, contractId, slug })
  }

  return (
    <>
      <div className="text-ink-600 mb-2">
        Pay to get your question answered!{' '}
        {subsidyDisabled
          ? 'All of your boost goes to feed promotion.'
          : 'Half of your boost goes to feed promotion and half to trader subsidies.'}
      </div>

      <Row className="mb-2">
        <BuyAmountInput
          amount={amount}
          onChange={onAmountChange}
          error={error}
          setError={setError}
          disabled={isLoading}
        />
      </Row>

      <Button
        onClick={submit}
        disabled={isLoading || !!error || !amount}
        size="md"
        color="indigo"
      >
        Boost!
      </Button>

      {!!amount && (
        <div className="text-xs">
          Get {formatWithCommas(numClicks)} feed click
          {numClicks !== 1 ? 's' : ''}{' '}
          {!subsidyDisabled && (
            <>
              and {formatMoney((1 - SUBSIDY_FEE) * subsidyAmount)} in subsidies{' '}
            </>
          )}
          for {formatMoney(amount)}.
        </div>
      )}

      {isLoading && <div>Processing...</div>}
      {error && <div className="text-error text-right">{error}</div>}
      {success && <div>{success}</div>}
    </>
  )
}

function BoostFormRow(props: {
  contract: Contract
  amount: number | undefined
  setAmount: (amount: number | undefined) => void
}) {
  const { contract, amount, setAmount } = props

  const [loading, setLoading] = useState(false)
  const [showBid, setShowBid] = useState(true)
  const [costPerView, setCostPerView] = useState<number | undefined>(
    DEFAULT_AD_COST_PER_VIEW
  )

  const redeems = amount && costPerView ? Math.floor(amount / costPerView) : 0

  const error =
    !costPerView || costPerView < MIN_AD_COST_PER_VIEW
      ? `Bid at least ${formatMoney(MIN_AD_COST_PER_VIEW)}`
      : undefined

  const onSubmit = async () => {
    if (!amount || !costPerView) return

    setLoading(true)
    try {
      await boostMarket({
        marketId: contract.id,
        totalCost: amount,
        costPerView,
      })
      toast.success('Boosted!')
      setAmount(undefined)

      track('boost market', {
        slug: contract.slug,
        totalCost: amount,
        costPerView,
      })
    } catch (e) {
      toast.error(
        (e as any).message ??
          (typeof e === 'string' ? e : 'Error boosting market')
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="text-ink-600 mb-2">
        Feed promotion boosts this question higher on the feed based on user
        interests. Users earn a reward for clicking.
      </div>

      <Row className="items-center justify-between">
        <BuyAmountInput
          amount={amount}
          onChange={setAmount}
          error={error}
          setError={(_e) => {}}
          disabled={false}
        />
      </Row>

      {showBid && (
        <>
          <Row className="items-center justify-between">
            <div>
              Bid per click{' '}
              <InfoTooltip text="Bid more to increase the priority of your boost. Uses a first-price auction mechanism." />
            </div>
            <AmountInput
              amount={costPerView}
              onChangeAmount={setCostPerView}
              label={ENV_CONFIG.moneyMoniker}
              error={!!error}
              inputClassName="mr-2 w-36"
            />
          </Row>
          {error && <div className="text-error text-right">{error}</div>}
        </>
      )}

      <Col className="mb-2 gap-2">
        <span className="text-ink-800 mr-2 text-lg">
          = <strong>{redeems} clicks</strong>
        </span>

        {!showBid && (
          <Row className="items-center text-sm">
            at {formatMoney(costPerView ?? 0)} per click
            <Button
              onClick={() => setShowBid(true)}
              size="2xs"
              color="gray-outline"
              className="ml-1"
            >
              Change
            </Button>
          </Row>
        )}
      </Col>

      <Button onClick={onSubmit} disabled={!!error || !redeems || loading}>
        Buy
      </Button>
      {loading && <LoadingIndicator />}
    </>
  )
}

function FeedAnalytics(props: { contractId: string }) {
  const { contractId } = props
  const {
    data: adAnalytics,
    error,
    isLoading,
  } = useQuery(async () =>
    getAdAnalytics({
      contractId,
    })
  )
  if (error) {
    return (
      <div className="bg-scarlet-100 mb-2 rounded-md p-4">
        Error loading analytics
      </div>
    )
  }
  if (isLoading || !adAnalytics) {
    return (
      <div className=" mb-2 p-4">
        <LoadingIndicator />
      </div>
    )
  }

  const {
    totalViews,
    uniqueViewers,
    totalPromotedViews,
    uniquePromotedViewers,
    redeemCount,
    isBoosted,
    totalFunds,
    adCreatedTime,
  } = adAnalytics as APISchema<'get-ad-analytics'>['returns']

  return (
    <div className="mt-4">
      <div className="mb-2 text-lg">Feed Analytics</div>
      <Table className="text-ink-900 max-w-sm table-fixed">
        {adCreatedTime && (
          <>
            <TableItem
              label="Campaign start"
              value={new Date(adCreatedTime).toDateString()}
            />
            <TableItem label="Funds left" value={formatMoney(totalFunds)} />
          </>
        )}

        <TableItem
          label="Impressions"
          value={`${totalViews} (${uniqueViewers} people)`}
        />
        {isBoosted && (
          <TableItem
            label="Boost Impressions"
            value={`${totalPromotedViews} (${uniquePromotedViewers} people)`}
          />
        )}
        {isBoosted && <TableItem label="Boost clicks" value={redeemCount} />}
      </Table>
    </div>
  )
}

const TableItem = (props: { label: ReactNode; value?: ReactNode }) => (
  <tr>
    <td className="!pl-0 !pt-0">{props.label}</td>
    <td className="!pl-0 !pt-0">{props.value ?? '...'}</td>
  </tr>
)
