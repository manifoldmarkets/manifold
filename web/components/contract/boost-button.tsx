import { Contract } from 'common/contract'
import { formatMoney } from 'common/util/format'
import { AmountInput } from '../widgets/amount-input'
import { ReactNode, useState } from 'react'
import { boostMarket } from 'web/lib/firebase/api'
import { Button } from '../buttons/button'
import toast from 'react-hot-toast'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { DEFAULT_AD_COST_PER_VIEW, MIN_AD_COST_PER_VIEW } from 'common/boost'
import { db } from 'web/lib/supabase/db'
import { Table } from '../widgets/table'
import { uniqBy } from 'lodash'
import { ContractCardView } from 'common/events'
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

  return (
    <Modal open={isOpen} setOpen={setOpen} size="sm">
      <Col className="bg-canvas-0 gap-2.5  rounded p-4 pb-8 sm:gap-4">
        <Title className="!mb-2">🚀 Boost this question</Title>

        <div className="text-ink-600 mb-2">
          Boost this question higher in people's feeds.{' '}
          <InfoTooltip text="Boosted questions target user interests. Users earn a reward for clicking on the question." />
        </div>

        <BoostFormRow contract={contract} />
        <FeedAnalytics contractId={contract.id} />
      </Col>
    </Modal>
  )
}

function BoostFormRow(props: { contract: Contract }) {
  const { contract } = props

  const [loading, setLoading] = useState(false)
  const [showBid, setShowBid] = useState(false)
  const [totalCost, setTotalCost] = useState<number>()
  const [costPerView, setCostPerView] = useState<number | undefined>(
    DEFAULT_AD_COST_PER_VIEW
  )

  const redeems =
    totalCost && costPerView ? Math.floor(totalCost / costPerView) : 0

  const error =
    !costPerView || costPerView < MIN_AD_COST_PER_VIEW
      ? `Bid at least ${formatMoney(MIN_AD_COST_PER_VIEW)}`
      : undefined

  const onSubmit = async () => {
    setLoading(true)
    try {
      await boostMarket({
        marketId: contract.id,
        totalCost,
        costPerView,
      })
      toast.success('Boosted!')
      setTotalCost(undefined)

      track('boost market', {
        slug: contract.slug,
        totalCost,
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
      <Row className="items-center justify-between">
        <AmountInput
          amount={totalCost}
          onChangeAmount={setTotalCost}
          label={ENV_CONFIG.moneyMoniker}
          inputClassName="mr-2 w-36"
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

  // TODO rewrite these in functions.sql as a single rpc. This is ridiculous.

  const adQuery = useQuery(
    async () =>
      await db
        .from('market_ads')
        .select('id, funds, created_at, cost_per_view')
        .eq('market_id', contractId)
  )

  const viewQuery = useQuery(
    async () =>
      await db
        .from('user_seen_markets')
        .select('user_id, data')
        .eq('type', 'view market card')
        .eq('contract_id', contractId)
  )

  const redeemQuery = useQuery(
    async () =>
      await db
        .from('txns')
        .select('*', { count: 'exact' })
        .eq('data->>category', 'MARKET_BOOST_REDEEM')
        .eq('data->>fromId', adQuery.data?.data?.[0]?.id)
  )

  if (adQuery.error || viewQuery.error || redeemQuery.error) {
    return (
      <div className="bg-scarlet-100 mb-2 rounded-md p-4">
        Error loading analytics
      </div>
    )
  }

  const isBoosted = !!adQuery.data?.data?.length
  const lastAdData = adQuery.data?.data?.[0]
  const totalFunds =
    adQuery.data?.data?.reduce((acc, v) => acc + v.funds, 0) ?? 0
  const viewData = viewQuery.data?.data
  const promotedViewData = viewData?.filter(
    (v) => (v.data as ContractCardView).isPromoted
  )

  return (
    <div className="mt-4">
      <div className="mb-2 text-lg">
        Feed Analytics
        {(adQuery.isLoading ||
          viewQuery.isLoading ||
          redeemQuery.isLoading) && (
          <LoadingIndicator size="sm" className="ml-4 !inline-flex" />
        )}
      </div>
      <Table className="text-ink-900 max-w-sm table-fixed">
        {lastAdData && (
          <>
            <TableItem
              label="Campaign start"
              value={new Date(lastAdData.created_at).toDateString()}
            />
            <TableItem label="Funds left" value={formatMoney(totalFunds)} />
          </>
        )}

        <TableItem
          label="Impressions"
          value={
            viewData &&
            `${viewData.length} (${uniqBy(viewData, 'user_id').length} people)`
          }
        />
        {isBoosted && (
          <TableItem
            label="Boost Impressions"
            value={
              promotedViewData &&
              `${promotedViewData.length} (${
                uniqBy(promotedViewData, 'user_id').length
              } people)`
            }
          />
        )}
        {isBoosted && (
          <TableItem label="Boost clicks" value={redeemQuery.data?.count} />
        )}
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
