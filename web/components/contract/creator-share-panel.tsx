import { Contract } from 'common/contract'
import { getShareUrl } from 'common/util/share'
import { TweetButton } from '../buttons/tweet-button'
import { GradientContainer } from '../widgets/gradient-container'
import { BoostButton } from './boost-button'
import { formatMoney } from 'common/util/format'
import { REFERRAL_AMOUNT, UNIQUE_BETTOR_BONUS_AMOUNT } from 'common/economy'
import { Button } from '../buttons/button'
import { LinkIcon } from '@heroicons/react/outline'
import { getIsNative } from 'web/lib/native/is-native'
import { postMessageToNative } from '../native-message-listener'
import { NativeShareData } from 'common/native-share-data'
import { copyToClipboard } from 'web/lib/util/copy'
import { trackShareEvent } from 'web/lib/service/analytics'
import toast from 'react-hot-toast'
import { Row } from '../layout/row'

export function CreatorShareBoostPanel(props: { contract: Contract }) {
  const { contract } = props

  return (
    <GradientContainer className="mb-8 flex w-full p-4">
      <div className="mb-2 flex items-center gap-2">
        <BoostButton contract={contract} color="gradient-pink" size="lg" />

        <TweetButton
          tweetText={
            'I created a question. ' +
            getShareUrl(contract, contract.creatorUsername)
          }
        />
        <Button color="indigo-outline" size="lg" onClick={getOnClick(contract)}>
          <LinkIcon className={'mr-1 h-4 w-4'} aria-hidden="true" />
          Share
        </Button>
      </div>

      {contract.outcomeType !== 'POLL' && (
        <div className="text-ink-500 text-base">
          Earn {formatMoney(REFERRAL_AMOUNT)} for each sign up and{' '}
          {formatMoney(UNIQUE_BETTOR_BONUS_AMOUNT)} for each trader.
        </div>
      )}
    </GradientContainer>
  )
}

export function NonCreatorSharePanel(props: { contract: Contract }) {
  const { contract } = props

  return (
    <Row className="my-4 gap-4">
      <Button color="indigo-outline" size="lg" onClick={getOnClick(contract)}>
        <LinkIcon className={'mr-1 h-4 w-4'} aria-hidden="true" />
        Share
      </Button>
      <TweetButton
        tweetText={getShareUrl(contract, contract.creatorUsername)}
      />
    </Row>
  )
}

const getOnClick = (contract: Contract) => {
  const isNative = getIsNative()
  const url = getShareUrl(contract, contract.creatorUsername)

  return () => {
    if (!url) return
    if (isNative) {
      // If we want to extend this: iOS can use a url and a message, Android can use a title and a message.
      postMessageToNative('share', {
        message: url,
      } as NativeShareData)
    } else {
      copyToClipboard(url)
      toast.success('Link copied!')
    }

    trackShareEvent('copy market link', url)
  }
}
