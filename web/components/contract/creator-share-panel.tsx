import { Contract } from 'common/contract'
import { REFERRAL_AMOUNT, UNIQUE_BETTOR_BONUS_AMOUNT } from 'common/economy'
import { formatMoney } from 'common/util/format'
import { getShareUrl } from 'common/util/share'
import { CopyLinkButton } from '../buttons/copy-link-button'
import { TweetButton } from '../buttons/tweet-button'
import { GradientContainer } from '../widgets/gradient-container'
import { AmountInput } from '../widgets/amount-input'
import { useState } from 'react'
import { boostMarket } from 'web/lib/firebase/api'
import { Button } from '../buttons/button'
import toast from 'react-hot-toast'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { DEFAULT_AD_COST_PER_VIEW } from 'common/boost'

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
        questions like this one. All funds go to the viewers.
      </div>
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
