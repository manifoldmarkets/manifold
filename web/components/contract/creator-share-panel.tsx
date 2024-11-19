import { LinkIcon } from '@heroicons/react/outline'
import { ShareIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { Contract } from 'common/contract'
import { getShareUrl } from 'common/util/share'
import toast from 'react-hot-toast'
import { trackShareEvent } from 'web/lib/service/analytics'
import { copyToClipboard } from 'web/lib/util/copy'
import { Button } from '../buttons/button'
import { TweetButton } from '../buttons/tweet-button'
import { Row } from '../layout/row'
import { GradientContainer } from '../widgets/gradient-container'
import { BoostButton } from './boost-button'
import { AddBountyButton, CancelBountyButton } from './bountied-question'
import { UpgradeTierButton } from './upgrade-tier-button'
import { useNativeInfo } from 'web/components/native-message-provider'
import { formatMoney } from 'common/util/format'
import { UNIQUE_BETTOR_BONUS_AMOUNT } from 'common/economy'

export function CreatorShareBoostPanel(props: { contract: Contract }) {
  const { contract } = props
  return (
    <GradientContainer className="mb-8 flex w-full">
      <div className="mb-2 flex flex-wrap gap-2">
        <BoostButton contract={contract} />
        {contract.outcomeType == 'BOUNTIED_QUESTION' && (
          <AddBountyButton contract={contract} />
        )}
        {(contract.mechanism == 'cpmm-1' ||
          contract.mechanism == 'cpmm-multi-1') && (
          <UpgradeTierButton contract={contract} />
        )}
        <ShareLinkButton contract={contract} />
        <TweetButton
          tweetText={'I created a question. ' + getShareUrl(contract)}
          className="hidden sm:flex"
        />
        {contract.outcomeType == 'BOUNTIED_QUESTION' && (
          <CancelBountyButton contract={contract} />
        )}
      </div>

      {contract.outcomeType !== 'POLL' &&
        contract.outcomeType !== 'BOUNTIED_QUESTION' && (
          <div className="text-ink-500 text-base">
            Earn {formatMoney(UNIQUE_BETTOR_BONUS_AMOUNT)} for each trader.
          </div>
        )}
    </GradientContainer>
  )
}

export function NonCreatorSharePanel(props: { contract: Contract }) {
  const { contract } = props

  return (
    <Row className="my-4 flex-wrap gap-4">
      {contract.outcomeType == 'BOUNTIED_QUESTION' && (
        <AddBountyButton contract={contract} />
      )}
      <ShareLinkButton contract={contract} />
      <TweetButton
        tweetText={getShareUrl(contract)}
        className="hidden sm:flex"
      />
    </Row>
  )
}

const ShareLinkButton = (props: { contract: Contract; className?: string }) => {
  const { contract, className } = props
  const { isNative } = useNativeInfo()
  const url = getShareUrl(contract)

  const onClick = () => {
    if (!url) return
    copyToClipboard(url)
    if (!isNative) toast.success('Link copied!')

    trackShareEvent('copy market link', url, { contractId: contract.id })
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
