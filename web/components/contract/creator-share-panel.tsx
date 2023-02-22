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
      <div className="mb-6">Share your market</div>

      <div className="mb-2 text-base text-gray-500">
        Earn a {formatMoney(REFERRAL_AMOUNT)} referral bonus for each new sign
        up and {formatMoney(UNIQUE_BETTOR_BONUS_AMOUNT)} for each unique trader
        that bets in your market using your share link.
      </div>

      <CopyLinkButton
        url={getShareUrl(contract, contract.creatorUsername)}
        tracking="copy creator share link"
      />
      <Spacer h={8} />
      <TweetButton
        tweetText={
          'I created a market. ' +
          getShareUrl(contract, contract.creatorUsername)
        }
      />
    </GradientContainer>
  )
}
