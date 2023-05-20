import { Contract } from 'common/contract'
import { REFERRAL_AMOUNT, UNIQUE_BETTOR_BONUS_AMOUNT } from 'common/economy'
import { formatMoney } from 'common/util/format'
import { getShareUrl } from 'common/util/share'
import { CopyLinkButton } from '../buttons/copy-link-button'
import { TweetButton } from '../buttons/tweet-button'
import { GradientContainer } from '../widgets/gradient-container'
import { AmountInput } from '../widgets/amount-input'
import { ReactNode, useState } from 'react'
import { boostMarket } from 'web/lib/firebase/api'
import { Button } from '../buttons/button'
import toast from 'react-hot-toast'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { DEFAULT_AD_COST_PER_VIEW } from 'common/boost'
import { db } from 'web/lib/supabase/db'
import { useQuery } from 'react-query'
import { Table } from '../widgets/table'
import { uniqBy } from 'lodash'
import { ContractCardView } from 'common/events'

export function CreatorShareBoostPanel(props: { contract: Contract }) {
  const { contract } = props

  return (
    <GradientContainer className="mb-8 p-4">
      <div className="mb-2 flex gap-2">
        <div className="text-lg">Share:</div>
        <CopyLinkButton
          url={getShareUrl(contract, contract.creatorUsername)}
          eventTrackingName="copy creator market link"
          linkIconOnlyProps={{ tooltip: 'Copy link to market' }}
        />
        <TweetButton
          tweetText={
            'I created a market. ' +
            getShareUrl(contract, contract.creatorUsername)
          }
        />
      </div>

      <div className="text-ink-500 mb-6 text-base">
        Earn {formatMoney(REFERRAL_AMOUNT)} for each sign up and{' '}
        {formatMoney(UNIQUE_BETTOR_BONUS_AMOUNT)} for each trader.
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="mr-2 text-lg">Boost:</div>
        <BoostFormRow contract={contract} />
      </div>

      <div className="text-ink-500 mb-2 text-base">
        Bump up your market in the feed. We'll target it to users who like
        questions like this. Some funds go to viewers as a claimable reward.
      </div>
      <FeedAnalytics contractId={contract.id} />
    </GradientContainer>
  )
}

function BoostFormRow(props: { contract: Contract }) {
  const { contract } = props

  const [loading, setLoading] = useState(false)
  const [numViews, setNumViews] = useState<number>()
  const views = numViews ?? 0

  // TODO: let user set?
  const costPerView = DEFAULT_AD_COST_PER_VIEW
  const totalCost = views * costPerView

  const onSubmit = async () => {
    setLoading(true)
    try {
      await boostMarket({
        marketId: contract.id,
        totalCost,
        costPerView,
      })
      toast.success('Boosted!')
      setNumViews(undefined)
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
      <AmountInput
        amount={numViews}
        onChange={setNumViews}
        label="views"
        inputClassName="!pl-14 w-32"
      />
      <span className="text-ink-800 mr-2 min-w-[180px] text-base">
        x {formatMoney(costPerView)}/view = {formatMoney(totalCost)} total
      </span>
      <Button onClick={onSubmit} disabled={totalCost === 0 || loading}>
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
    ['ad data', contractId],
    async () =>
      await db
        .from('market_ads')
        .select('id, funds, created_at, cost_per_view')
        .eq('market_id', contractId),
    { refetchInterval: false }
  )

  const viewQuery = useQuery(
    ['view market card data', contractId],
    async () =>
      await db
        .from('user_seen_markets')
        .select('user_id, data')
        .eq('type', 'view market card')
        .eq('contract_id', contractId),
    { refetchInterval: false }
  )

  const clickQuery = useQuery(
    ['click through data', contractId],
    async () =>
      await db
        .from('user_events')
        .select('*', { count: 'exact' })
        .eq('name', 'click market card feed')
        .eq('contract_id', contractId),
    { refetchInterval: false }
  )

  const redeemQuery = useQuery(
    ['redeem data', contractId],
    async () =>
      await db
        .from('txns')
        .select('*', { count: 'exact' })
        .eq('data->>category', 'MARKET_BOOST_REDEEM')
        .eq('data->>fromId', adQuery.data?.data?.[0]?.id),
    { enabled: adQuery.isSuccess, refetchInterval: false }
  )

  if (
    adQuery.isError ||
    viewQuery.isError ||
    clickQuery.isError ||
    redeemQuery.isError
  ) {
    return (
      <div className="bg-scarlet-100 mb-2 rounded-md p-4">
        Error loading analytics
      </div>
    )
  }

  const isBoosted = !!adQuery.data?.data?.length
  const adData = adQuery.data?.data?.[0]
  const viewData = viewQuery.data?.data
  const promotedViewData = viewData?.filter(
    (v) => (v.data as ContractCardView).isPromoted
  )

  const clickData = clickQuery.data
  const promotedClickData = clickData?.data?.filter(
    (v) => (v.data as any).isPromoted
  )

  return (
    <div className="mt-4">
      <div className="mb-2 text-lg">
        Feed Analytics
        {(adQuery.isFetching ||
          viewQuery.isFetching ||
          redeemQuery.isFetching) && (
          <LoadingIndicator size="sm" className="ml-4 !inline-flex" />
        )}
      </div>
      <Table className="text-ink-900 max-w-sm table-fixed">
        {adData && (
          <>
            <TableItem
              label="Campaign start"
              value={new Date(adData.created_at).toDateString()}
            />
            <TableItem label="Funds left" value={formatMoney(adData.funds)} />
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
          <TableItem label="Redeems" value={redeemQuery.data?.count} />
        )}
        <TableItem label="Clicks" value={clickData?.count} />
        {isBoosted && (
          <TableItem label="Boost Clicks" value={promotedClickData?.length} />
        )}
      </Table>
    </div>
  )
}

const TableItem = (props: { label: ReactNode; value?: ReactNode }) => (
  <tr>
    <td className="!pt-0 !pl-0">{props.label}</td>
    <td className="!pt-0 !pl-0">{props.value ?? '...'}</td>
  </tr>
)
