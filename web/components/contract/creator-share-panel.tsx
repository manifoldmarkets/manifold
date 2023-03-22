import { Contract } from 'common/contract'
import { REFERRAL_AMOUNT, UNIQUE_BETTOR_BONUS_AMOUNT } from 'common/economy'
import { formatMoney } from 'common/util/format'
import { getShareUrl } from 'common/util/share'
import { CopyLinkButton } from '../buttons/copy-link-button'
import { TweetButton } from '../buttons/tweet-button'
import { Spacer } from '../layout/spacer'
import { GradientContainer } from '../widgets/gradient-container'

export function CreatorSharePanel(props: { contract: Contract }) {
  const { contract } = props

  return (
    <GradientContainer className="mb-8 p-4">
      <div className="mb-4 text-lg">Share your market</div>

      <div className="text-ink-500 mb-2 text-base">
        Earn {formatMoney(REFERRAL_AMOUNT)} for each sign up and{' '}
        {formatMoney(UNIQUE_BETTOR_BONUS_AMOUNT)} for each trader.
      </div>

      <CopyLinkButton
        url={getShareUrl(contract, contract.creatorUsername)}
        eventTrackingName="copy creator market link"
      />
      <Spacer h={2} />
      <TweetButton
        tweetText={
          'I created a market. ' +
          getShareUrl(contract, contract.creatorUsername)
        }
      />
    </GradientContainer>
  )
}
