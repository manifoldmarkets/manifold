import { Contract } from 'common/contract'
import { getShareUrl } from 'common/util/share'
import { CopyLinkButton } from '../buttons/copy-link-button'
import { TweetButton } from '../buttons/tweet-button'
import { GradientContainer } from '../widgets/gradient-container'
import { BoostButton } from './boost-button'
import { formatMoney } from 'common/util/format'
import { REFERRAL_AMOUNT, UNIQUE_BETTOR_BONUS_AMOUNT } from 'common/economy'

export function CreatorShareBoostPanel(props: { contract: Contract }) {
  const { contract } = props

  return (
    <GradientContainer className="mb-8 max-w-md p-4">
      <div className="mb-2 flex items-center gap-2">
        <div className="mr-2 text-lg">Share:</div>

        <BoostButton contract={contract} color="gradient-pink" size="lg" />

        <TweetButton
          tweetText={
            'I created a market. ' +
            getShareUrl(contract, contract.creatorUsername)
          }
        />

        <CopyLinkButton
          url={getShareUrl(contract, contract.creatorUsername)}
          eventTrackingName="copy creator market link"
          linkIconOnlyProps={{ tooltip: 'Copy link to market' }}
        />
      </div>

      <div className="text-ink-500 text-base">
        Earn {formatMoney(REFERRAL_AMOUNT)} for each sign up and{' '}
        {formatMoney(UNIQUE_BETTOR_BONUS_AMOUNT)} for each trader.
      </div>
    </GradientContainer>
  )
}
