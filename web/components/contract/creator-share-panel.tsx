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
import { AddBountyButton, CancelBountyButton } from './bountied-question'
import { useNativeInfo } from 'web/components/native-message-provider'
import { formatMoney } from 'common/util/format'
import { getUniqueBettorBonusAmount } from 'common/economy'
import { AddBoostButton } from './add-boost-button'
import { BoostAnalytics } from './boost-analytics'
import { Col } from '../layout/col'

export function CreatorSharePanel(props: { contract: Contract }) {
  const { contract } = props
  return (
    <GradientContainer className="mt-4 flex w-full">
      <Col className="w-full gap-4">
        <Row className="flex-wrap gap-2">
          {contract.outcomeType == 'BOUNTIED_QUESTION' && (
            <AddBountyButton contract={contract} />
          )}
          <AddBoostButton contract={contract} />
          <ShareLinkButton contract={contract} />
          <TweetButton
            tweetText={'I created a question. ' + getShareUrl(contract)}
            className="hidden sm:flex"
          />
          {contract.outcomeType == 'BOUNTIED_QUESTION' && (
            <CancelBountyButton contract={contract} />
          )}
        </Row>

        {(contract.mechanism === 'cpmm-1' ||
          contract.mechanism === 'cpmm-multi-1') && (
          <div className="text-ink-500 text-base">
            Earn{' '}
            {formatMoney(getUniqueBettorBonusAmount(contract.totalLiquidity))}
            for each new trader.
          </div>
        )}

        <BoostAnalytics contract={contract} />
      </Col>
    </GradientContainer>
  )
}

export function NonCreatorSharePanel(props: {
  contract: Contract
  children?: React.ReactNode
}) {
  const { contract, children } = props

  return (
    <Row className="my-4 flex-wrap gap-3 sm:gap-4">
      {contract.outcomeType == 'BOUNTIED_QUESTION' && (
        <AddBountyButton contract={contract} />
      )}
      <AddBoostButton contract={contract} />
      {children}
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
