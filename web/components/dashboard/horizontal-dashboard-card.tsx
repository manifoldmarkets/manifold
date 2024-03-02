import clsx from 'clsx'
import Link from 'next/link'
import Router from 'next/router'
import { useEffect, useState } from 'react'

import { AD_WAIT_SECONDS } from 'common/boost'
import { Contract, contractPath, isBinaryMulti } from 'common/contract'
import { ContractCardView } from 'common/events'
import { ClaimButton } from 'web/components/ad/claim-ad-button'
import { BinaryMultiAnswersPanel } from 'web/components/answers/binary-multi-answers-panel'
import {
  ContractStatusLabel,
  VisibilityIcon,
} from 'web/components/contract/contracts-table'
import { useAdTimer } from 'web/hooks/use-ad-timer'
import { useFirebasePublicContract } from 'web/hooks/use-contract-supabase'
import { DEBUG_FEED_CARDS, FeedTimelineItem } from 'web/hooks/use-feed-timeline'
import { useIsVisible } from 'web/hooks/use-is-visible'
import { useUser } from 'web/hooks/use-user'
import { track } from 'web/lib/service/analytics'
import { getAdCanPayFunds } from 'web/lib/supabase/ads'
import { getMarketMovementInfo } from 'web/lib/supabase/feed-timeline/feed-market-movement-display'
import { BetButton } from '../bet/feed-bet-button'
import { FeedBinaryChart } from '../feed/feed-chart'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { PollPanel } from '../poll/poll-panel'
import { ClickFrame } from '../widgets/click-frame'
import { SmallAnswerBars } from '../answers/small-answer'

export function HorizontalDashboardCard(props: {
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

  const { closeTime, outcomeType, mechanism } = contract
  const isBinaryMc = isBinaryMulti(contract)
  const isBinaryCpmm = outcomeType === 'BINARY' && mechanism === 'cpmm-1'
  const isClosed = closeTime && closeTime < Date.now()
  const path = contractPath(contract)

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

  return (
    <ClickFrame
      className={clsx(
        'group relative rounded-xl',
        'cursor-pointer ',
        'flex w-full flex-col gap-0.5 px-4',
        size === 'sm'
          ? 'bg-canvas-50'
          : size === 'md'
          ? 'bg-canvas-0 sm:px-6'
          : 'bg-canvas-0',
        className
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
        <div
          className={clsx(
            'flex flex-col sm:flex-row sm:justify-between sm:gap-4',
            size === 'xs' ? '' : 'gap-1'
          )}
        >
          {/* Title is link to contract for open in new tab and a11y */}
          <Link
            className="group-hover:text-primary-700 grow items-start transition-colors group-hover:underline sm:text-lg"
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
        {contract.outcomeType === 'MULTIPLE_CHOICE' && !isBinaryMc && (
          <SmallAnswerBars contract={contract} maxAnswers={4} />
        )}

        {isBinaryMc && contract.mechanism === 'cpmm-multi-1' && (
          <BinaryMultiAnswersPanel
            contract={contract}
            answers={contract.answers}
          />
        )}

        {isBinaryCpmm && (showGraph || !ignore) && (
          <FeedBinaryChart
            contract={contract}
            className="my-4"
            startDate={startTime ? startTime : contract.createdTime}
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
      </div>
    </ClickFrame>
  )
}
