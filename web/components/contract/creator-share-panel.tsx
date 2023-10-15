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
import { copyToClipboard } from 'web/lib/util/copy'
import { trackShareEvent } from 'web/lib/service/analytics'
import toast from 'react-hot-toast'
import { Row } from '../layout/row'
import { useUser } from 'web/hooks/use-user'
import { AddLiquidityButton } from './add-liquidity-button'
import { ShareIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { ShareQRButton } from '../buttons/share-qr-button'
import { AddBountyButton } from './bountied-question'

export function CreatorShareBoostPanel(props: { contract: Contract }) {
  const { contract } = props

  return (
    <GradientContainer className="mb-8 flex w-full">
      <div className="mb-2 flex flex-wrap gap-2">
        <BoostButton contract={contract} color="gradient-pink" />
        <AddLiquidityButton contract={contract} />
        {contract.outcomeType == 'BOUNTIED_QUESTION' && (
          <AddBountyButton contract={contract} />
        )}
        <ShareLinkButton contract={contract} />

        <TweetButton
          tweetText={
            'I created a question. ' +
            getShareUrl(contract, contract.creatorUsername)
          }
          className="hidden sm:flex"
        />
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
  const user = useUser()

  return (
    <Row className="my-4 flex-wrap gap-4">
      <BoostButton contract={contract} color="indigo-outline" />
      <AddLiquidityButton contract={contract} />
      {contract.outcomeType == 'BOUNTIED_QUESTION' && (
        <AddBountyButton contract={contract} />
      )}
      <ShareLinkButton contract={contract} username={user?.username} />
      <TweetButton
        tweetText={getShareUrl(contract, user?.username)}
        className="hidden sm:flex"
      />
    </Row>
  )
}

const ShareLinkButton = (props: {
  contract: Contract
  username?: string
  className?: string
}) => {
  const { contract, username, className } = props
  const isNative = getIsNative()
  const url = getShareUrl(contract, username ?? contract.creatorUsername)

  const onClick = () => {
    if (!url) return
    copyToClipboard(url)
    if (!isNative) toast.success('Link copied!')

    trackShareEvent('copy market link', url)
  }

  return (
    <Button
      color="indigo-outline"
      size="lg"
      onClick={onClick}
      className={clsx('gap-1', className)}
    >
      {isNative ? (
        <ShareIcon className={'h-4 w-4'} aria-hidden />
      ) : (
        <LinkIcon className={'h-4 w-4'} aria-hidden />
      )}
      Share
    </Button>
  )
}
