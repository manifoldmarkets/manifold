import clsx from 'clsx'
import Link from 'next/link'
import Router from 'next/router'
import { useEffect, useState } from 'react'

import { Contract, contractPath } from 'common/contract'
import { ContractMetric } from 'common/contract-metric'
import { ContractCardView } from 'common/events'
import { User } from 'common/user'
import { formatMoney, shortFormatNumber } from 'common/util/format'
import { ClaimButton } from 'web/components/ad/claim-ad-button'
import {
  ContractStatusLabel,
  VisibilityIcon,
} from 'web/components/contract/contracts-table'
import { Avatar } from 'web/components/widgets/avatar'
import { UserLink } from 'web/components/widgets/user-link'
import { useFirebasePublicContract } from 'web/hooks/use-contract-supabase'
import { DEBUG_FEED_CARDS, FeedTimelineItem } from 'web/hooks/use-feed-timeline'
import { useIsVisible } from 'web/hooks/use-is-visible'
import { useSavedContractMetrics } from 'web/hooks/use-saved-contract-metrics'
import { useUser } from 'web/hooks/use-user'
import { track } from 'web/lib/service/analytics'
import { getMarketMovementInfo } from 'web/lib/supabase/feed-timeline/feed-market-movement-display'
import { SimpleAnswerBars } from '../answers/answers-panel'
import { BetButton } from '../bet/feed-bet-button'
import { CommentsButton } from '../comments/comments-button'
import { CardReason } from '../feed/card-reason'
import { FeedBinaryChart } from '../feed/feed-chart'
import FeedContractCardDescription from '../feed/feed-contract-card-description'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { PollPanel } from '../poll/poll-panel'
import { ClickFrame } from '../widgets/click-frame'
import { LikeButton } from './like-button'
import { TradesButton } from './trades-button'
import { FeedDropdown } from '../feed/card-dropdown'
import { CategoryTags } from '../feed/feed-timeline-items'
import { JSONEmpty } from 'web/components/contract/contract-description'
import { ENV_CONFIG } from 'common/envs/constants'
import { TbDropletHeart, TbMoneybag } from 'react-icons/tb'
import { Tooltip } from 'web/components/widgets/tooltip'
import { Button } from 'web/components/buttons/button'
import { useAdTimer } from 'web/hooks/use-ad-timer'
import { AD_WAIT_SECONDS } from 'common/boost'
import { getAdCanPayFunds } from 'web/lib/supabase/ads'

export function FeedContractCard(props: {
  contract: Contract
  children?: React.ReactNode
  promotedData?: { adId: string; reward: number }
  /** location of the card, to disambiguate card click events */
  trackingPostfix?: string
  item?: FeedTimelineItem
  className?: string
  /** whether this card is small, like in card grids.*/
  size?: 'md' | 'sm' | 'xs'
  hide?: () => void
  showGraph?: boolean
  hideBottomRow?: boolean
  hideTags?: boolean
  hideReason?: boolean
}) {
  const {
    promotedData,
    trackingPostfix,
    item,
    className,
    children,
    hide,
    showGraph,
    hideBottomRow,
    size = 'md',
    hideTags,
    hideReason,
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

  // Note: if we ever make cards taller than viewport, we'll need to pass a lower threshold to the useIsVisible hook

  const [visible, setVisible] = useState(false)
  const { ref } = useIsVisible(
    () => {
      !DEBUG_FEED_CARDS &&
        track('view market card', {
          contractId: contract.id,
          creatorId: contract.creatorId,
          slug: contract.slug,
          feedId: item?.id,
          isPromoted: !!promotedData,
        } as ContractCardView)
      setVisible(true)
    },
    false,
    true,
    () => {
      setVisible(false)
    }
  )

  const adSecondsLeft =
    // eslint-disable-next-line react-hooks/rules-of-hooks
    promotedData && useAdTimer(contract.id, AD_WAIT_SECONDS, visible)
  const [canAdPay, setCanAdPay] = useState(true)
  const adId = promotedData?.adId
  useEffect(() => {
    if (adId) {
      getAdCanPayFunds(adId).then((canPay) => {
        setCanAdPay(canPay)
      })
    }
  }, [adId])

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
    <ClickFrame
      className={clsx(
        className,
        'relative rounded-xl',
        'cursor-pointer ',
        'hover:ring-[1px]',
        'flex w-full flex-col gap-0.5 px-4',
        size === 'sm'
          ? 'bg-canvas-50'
          : size === 'md'
          ? 'bg-canvas-0 shadow-md sm:px-6'
          : 'bg-canvas-0'
      )}
      onClick={(e) => {
        trackClick()
        Router.push(path)
        e.currentTarget.focus() // focus the div like a button, for style
      }}
      ref={ref}
    >
      <Col
        className={clsx(
          'w-full flex-col pt-2',
          size === 'xs' ? '' : 'gap-1.5 '
        )}
      >
        <Row className="w-full justify-between">
          <Row className={'text-ink-500 items-center gap-1 text-sm'}>
            <Avatar
              size={size === 'xs' ? '2xs' : 'xs'}
              className={'mr-0.5'}
              avatarUrl={creatorAvatarUrl}
              username={creatorUsername}
            />
            <UserLink
              user={{
                id: creatorId,
                name: creatorName,
                username: creatorUsername,
              }}
              className={'w-full max-w-[10rem] text-ellipsis sm:max-w-[12rem]'}
            />
          </Row>

          <Row className="gap-2">
            {promotedData && canAdPay && (
              <div className="text-ink-400 w-12 text-sm">
                Ad {adSecondsLeft ? adSecondsLeft + 's' : ''}
              </div>
            )}
            {!hideReason && (
              <CardReason
                item={item}
                contract={contract}
                probChange={probChange}
                since={startTime}
              />
            )}
            {hide && (
              <FeedDropdown
                contract={contract}
                item={item}
                interesting={true}
                toggleInteresting={hide}
                importanceScore={props.contract.importanceScore}
              />
            )}
          </Row>
        </Row>

        <div
          className={clsx(
            'flex flex-col sm:flex-row sm:justify-between sm:gap-4',
            size === 'xs' ? '' : 'gap-1'
          )}
        >
          {/* Title is link to contract for open in new tab and a11y */}
          <Link
            className="hover:text-primary-700 grow items-start transition-colors sm:text-lg"
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

      <div
        className={clsx(
          'w-full overflow-hidden',
          size === 'xs' ? 'pt-0.5' : 'pt-2'
        )}
      >
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
        {promotedData && canAdPay && (
          <Col className={clsx('w-full items-center')}>
            <ClaimButton
              {...promotedData}
              onClaim={() => Router.push(path)}
              disabled={adSecondsLeft !== undefined && adSecondsLeft > 0}
              className={'z-10 my-2 whitespace-nowrap'}
            />
          </Col>
        )}

        {isBinaryCpmm && metrics && metrics.hasShares && (
          <YourMetricsFooter metrics={metrics} />
        )}

        {size === 'md' &&
          item?.dataType == 'new_contract' &&
          nonTextDescription && (
            <FeedContractCardDescription
              contract={contract}
              nonTextDescription={nonTextDescription}
            />
          )}
        {!hideBottomRow && (
          <Col>
            {!hideTags && (
              <CategoryTags
                categories={contract.groupLinks}
                // hide tags after first line. (tags are 24 px tall)
                className="h-6 flex-wrap overflow-hidden"
              />
            )}
            <BottomActionRow
              contract={contract}
              user={user}
              underline={!!children}
            />
            {children}
          </Col>
        )}
      </div>
    </ClickFrame>
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
          contentText={question}
          size={'2xs'}
          trackingLocation={'contract card (feed)'}
          placement="top"
        />
      </BottomRowButtonWrapper>
    </Row>
  )
}
export function YourMetricsFooter(props: { metrics: ContractMetric }) {
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
