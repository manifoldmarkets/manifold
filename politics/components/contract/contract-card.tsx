import clsx from 'clsx'

import { Contract, contractPath } from 'common/contract'
import { ContractMetric } from 'common/contract-metric'
import { ENV_CONFIG } from 'common/envs/constants'
import { ContractCardView } from 'common/events'
import { User } from 'common/user'
import { formatMoney, shortFormatNumber } from 'common/util/format'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { TbDropletHeart, TbMoneybag } from 'react-icons/tb'
import { ClaimButton } from 'web/components/ad/claim-ad-button'
import { BetButton } from 'web/components/bet/feed-bet-button'
import { Button } from 'web/components/buttons/button'
import { CommentsButton } from 'web/components/comments/comments-button'
import { JSONEmpty } from 'web/components/contract/contract-description'
import {
  ContractStatusLabel,
  VisibilityIcon,
} from 'web/components/contract/contracts-table'
import { LikeButton } from 'web/components/contract/like-button'
import { TradesButton } from 'web/components/contract/trades-button'
import { FeedBinaryChart } from 'web/components/feed/feed-chart'
import FeedContractCardDescription from 'web/components/feed/feed-contract-card-description'
import { CategoryTags } from 'web/components/feed/feed-timeline-items'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { PollPanel } from 'web/components/poll/poll-panel'
import { ClickFrame } from 'web/components/widgets/click-frame'
import { Tooltip } from 'web/components/widgets/tooltip'
import { useFirebasePublicContract } from 'web/hooks/use-contract-supabase'
import { DEBUG_FEED_CARDS, FeedTimelineItem } from 'web/hooks/use-feed-timeline'
import { useIsVisible } from 'web/hooks/use-is-visible'
import { useSavedContractMetrics } from 'web/hooks/use-saved-contract-metrics'
import { useUser } from 'web/hooks/use-user'
import { track } from 'web/lib/service/analytics'
import { getMarketMovementInfo } from 'web/lib/supabase/feed-timeline/feed-market-movement-display'
import { ShadowFrame } from '../button/shadow-frame'
import { SimpleAnswerBars } from '../answers/answers-panel'

export function FeedContractCard(props: {
  contract: Contract
  children?: React.ReactNode
  promotedData?: { adId: string; reward: number }
  /** location of the card, to disambiguate card click events */
  trackingPostfix?: string
  item?: FeedTimelineItem
  className?: string
  /** whether this card is small, like in card grids.*/
  small?: boolean
  hide?: () => void
  showGraph?: boolean
  hideBottomRow?: boolean
}) {
  const {
    promotedData,
    trackingPostfix,
    item,
    className,
    children,
    small,
    hide,
    showGraph,
    hideBottomRow,
  } = props
  const user = useUser()

  const contract =
    useFirebasePublicContract(props.contract.visibility, props.contract.id) ??
    props.contract

  const {
    closeTime,
    creatorId,
    creatorName,
    creatorUsername,
    creatorAvatarUrl,
    outcomeType,
    mechanism,
  } = contract

  const isBinaryCpmm = outcomeType === 'BINARY' && mechanism === 'cpmm-1'
  const isClosed = closeTime && closeTime < Date.now()
  const path = contractPath(contract)
  const metrics = useSavedContractMetrics(contract)

  const router = useRouter()
  // Note: if we ever make cards taller than viewport, we'll need to pass a lower threshold to the useIsVisible hook

  const { ref } = useIsVisible(
    () =>
      !DEBUG_FEED_CARDS &&
      track('view market card', {
        contractId: contract.id,
        creatorId: contract.creatorId,
        slug: contract.slug,
        feedId: item?.id,
        isPromoted: !!promotedData,
      } as ContractCardView),
    false
  )

  const { probChange, startTime, ignore } = getMarketMovementInfo(
    contract,
    item
  )

  const trackClick = () =>
    track(('click market card ' + trackingPostfix).trim(), {
      contractId: contract.id,
      creatorId: contract.creatorId,
      slug: contract.slug,
      feedId: item?.id,
      isPromoted: !!promotedData,
    })

  const nonTextDescription = !JSONEmpty(contract.description)

  return (
    <ShadowFrame
      className={clsx(
        className,
        'relative',
        'cursor-pointer ',
        'ring-ink-1000 ring-1',
        'bg-canvas-0 flex w-full flex-col gap-0.5 p-4'
      )}
      onClick={(e) => {
        trackClick()
        router.push(path)
        e.currentTarget.focus() // focus the div like a button, for style
      }}
      ref={ref}
    >
      <Col className={'w-full flex-col gap-1.5'}>
        <div
          className={clsx(
            'flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4'
          )}
        >
          {/* Title is link to contract for open in new tab and a11y */}
          <Link
            className="text-ink-1000 grow items-start font-serif transition-colors hover:underline sm:text-lg"
            href={path}
            onClick={trackClick}
          >
            <VisibilityIcon contract={contract} /> {contract.question}
          </Link>
          <Row className="w-full items-center justify-end gap-3 whitespace-nowrap sm:w-fit">
            {contract.outcomeType !== 'MULTIPLE_CHOICE' && (
              <ContractStatusLabel
                className="text-lg font-bold"
                contract={contract}
              />
            )}
            {isBinaryCpmm && !isClosed && (
              <BetButton
                feedId={item?.id}
                contract={contract}
                user={user}
                className="h-min"
              />
            )}
          </Row>
        </div>
      </Col>

      <div className="w-full overflow-hidden pt-2">
        {contract.outcomeType === 'POLL' && (
          <PollPanel contract={contract} maxOptions={4} />
        )}
        {contract.outcomeType === 'MULTIPLE_CHOICE' && (
          <SimpleAnswerBars contract={contract} maxAnswers={4} />
        )}

        {isBinaryCpmm && (showGraph || !ignore) && (
          <FeedBinaryChart
            contract={contract}
            className="my-4"
            startDate={startTime ? startTime : contract.createdTime}
            addLeadingBetPoint={true}
          />
        )}
        {promotedData && (
          <Col className={'w-full items-center'}>
            <ClaimButton
              {...promotedData}
              onClaim={() => router.push(path)}
              disabled={false}
              className={'z-10 my-2 whitespace-nowrap'}
            />
          </Col>
        )}

        {isBinaryCpmm && metrics && metrics.hasShares && (
          <YourMetricsFooter metrics={metrics} />
        )}

        {!small && item?.dataType == 'new_contract' && nonTextDescription && (
          <FeedContractCardDescription
            contract={contract}
            nonTextDescription={nonTextDescription}
          />
        )}
        {/* {!hideBottomRow && (
          <Col>
            <BottomActionRow
              contract={contract}
              user={user}
              underline={!!children}
            />
            {children}
          </Col>
        )} */}
      </div>
    </ShadowFrame>
  )
}

// ensures that the correct spacing is between buttons
const BottomRowButtonWrapper = (props: { children: React.ReactNode }) => {
  return (
    <Row className="basis-10 justify-start whitespace-nowrap">
      {props.children}
    </Row>
  )
}

const BottomActionRow = (props: {
  contract: Contract
  user: User | null | undefined
  underline?: boolean
}) => {
  const { contract, user, underline } = props
  const { question } = contract

  return (
    <Row
      className={clsx(
        'justify-between pt-2',
        underline ? 'border-1 border-ink-200 border-b pb-3' : 'pb-2'
      )}
    >
      <BottomRowButtonWrapper>
        <TradesButton contract={contract} className={'h-full'} />
      </BottomRowButtonWrapper>

      {contract.outcomeType === 'BOUNTIED_QUESTION' && (
        <BottomRowButtonWrapper>
          <div className="text-ink-500 z-10 flex items-center gap-1.5 text-sm">
            <TbMoneybag className="h-6 w-6 stroke-2" />
            <div>
              {ENV_CONFIG.moneyMoniker}
              {shortFormatNumber(contract.bountyLeft)}
            </div>
          </div>
        </BottomRowButtonWrapper>
      )}

      {/* cpmm markets */}
      {'totalLiquidity' in contract && (
        <BottomRowButtonWrapper>
          <Button
            disabled={true}
            size={'2xs'}
            color={'gray-white'}
            className={'disabled:cursor-pointer'}
          >
            <Tooltip text={`Total liquidity`} placement="top" noTap>
              <Row
                className={'text-ink-500 h-full items-center gap-1.5 text-sm'}
              >
                <TbDropletHeart className="h-6 w-6 stroke-2" />
                <div>
                  {ENV_CONFIG.moneyMoniker}
                  {shortFormatNumber(contract.totalLiquidity)}
                </div>
              </Row>
            </Tooltip>
          </Button>
        </BottomRowButtonWrapper>
      )}

      <BottomRowButtonWrapper>
        <CommentsButton contract={contract} user={user} className={'h-full'} />
      </BottomRowButtonWrapper>
      <BottomRowButtonWrapper>
        <LikeButton
          contentId={contract.id}
          contentCreatorId={contract.creatorId}
          user={user}
          contentType={'contract'}
          totalLikes={contract.likedByUserCount ?? 0}
          contract={contract}
          contentText={question}
          size={'2xs'}
          trackingLocation={'contract card (feed)'}
          placement="top"
        />
      </BottomRowButtonWrapper>
    </Row>
  )
}
function YourMetricsFooter(props: { metrics: ContractMetric }) {
  const { metrics } = props
  const { totalShares, maxSharesOutcome, profit } = metrics
  const { YES: yesShares, NO: noShares } = totalShares

  return (
    <Row className="bg-ink-200/50 my-2 flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded p-2 text-sm">
      <Row className="items-center gap-2">
        <span className="text-ink-500">Payout on {maxSharesOutcome}</span>
        <span className="text-ink-700 font-semibold">
          {maxSharesOutcome === 'YES'
            ? formatMoney(yesShares)
            : formatMoney(noShares)}{' '}
        </span>
      </Row>
      <Row className="items-center gap-2">
        <div className="text-ink-500">Profit </div>
        <div className={clsx('text-ink-700 font-semibold')}>
          {profit ? formatMoney(profit) : '--'}
        </div>
      </Row>
    </Row>
  )
}
