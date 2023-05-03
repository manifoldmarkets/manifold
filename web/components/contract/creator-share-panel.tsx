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
        questions like this. Funds go to the viewers.
      </div>
      <BoostAnalytics contractId={contract.id} />
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

function BoostAnalytics(props: { contractId: string }) {
  const { contractId } = props
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
        .from('user_events')
        .select()
        .eq('name', 'view market card')
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

  if (adQuery.isError || viewQuery.isError || redeemQuery.isError) {
    return (
      <div className="bg-scarlet-100 mb-2 rounded-md p-4">
        Error loading analytics
      </div>
    )
  }

  const viewData = viewQuery.data?.data

  if (adQuery.data?.data?.length) {
    const { funds, created_at, cost_per_view } = adQuery.data.data[0]

    return (
      <div className="mt-4">
        <div className="mb-1 font-semibold">
          Analytics{' '}
          {(adQuery.isFetching ||
            viewQuery.isFetching ||
            redeemQuery.isFetching) &&
            '...'}
        </div>
        <Table className="text-ink-900">
          <TableItem
            label="Campaign start"
            value={new Date(created_at).toDateString()}
          />
          <TableItem
            label="Funds left"
            value={`${formatMoney(funds)} (${funds / cost_per_view} redeems)`}
          />
          {viewData && (
            <>
              <TableItem
                label="Total Impressions"
                value={`${viewData.length} (${
                  uniqBy(viewData, 'user_id').length
                } unique)`}
              />
              <TableItem
                label="Impressions since campaign start"
                value={`${
                  viewData.filter(
                    (i) => i.ts && Date.parse(i.ts) > Date.parse(created_at)
                  ).length
                }`}
              />
            </>
          )}
          {redeemQuery.data && (
            <TableItem label="Redeems" value={redeemQuery.data.count} />
          )}
        </Table>
      </div>
    )
  }

  return null
}

const TableItem = (props: { label: ReactNode; value: ReactNode }) => (
  <tr>
    <td>{props.label}</td>
    <td>{props.value}</td>
  </tr>
)
