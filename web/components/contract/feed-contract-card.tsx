import clsx from 'clsx'
import Link from 'next/link'
import Router from 'next/router'

import { Contract, contractPath } from 'common/contract'
import { ContractMetric } from 'common/contract-metric'
import { ContractCardView } from 'common/events'
import { User } from 'common/user'
import { formatMoney } from 'common/util/format'
import { useFirebasePublicAndRealtimePrivateContract } from 'web/hooks/use-contract-supabase'
import { FeedTimelineItem } from 'web/hooks/use-feed-timeline'
import { useIsVisible } from 'web/hooks/use-is-visible'
import { useSavedContractMetrics } from 'web/hooks/use-saved-contract-metrics'
import { useUser } from 'web/hooks/use-user'
import { track } from 'web/lib/service/analytics'
import { BetRow } from '../bet/bet-row'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { CommentsButton } from '../swipe/swipe-comments'
import { Tooltip } from '../widgets/tooltip'
import { LikeButton } from './like-button'
import { TradesButton } from './trades-button'
import { updateUserDisinterestEmbedding } from 'web/lib/firebase/api'
import { TiVolumeMute } from 'react-icons/ti'
import { toast } from 'react-hot-toast'
import React, { useState } from 'react'
import { ContractStatusLabel } from 'web/components/contract/contracts-table'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import { UserLink } from 'web/components/widgets/user-link'
import { Avatar } from 'web/components/widgets/avatar'
import { ClaimButton } from 'web/components/ad/claim-ad-button'
import NoSymbolIcon from 'web/lib/icons/no-symbol'
import { AnswersPanel } from '../answers/answers-panel'

export function FeedContractCard(props: {
  contract: Contract
  promotedData?: { adId: string; reward: number }
  /** location of the card, to disambiguate card click events */
  trackingPostfix?: string
  hasItems?: boolean
  item?: FeedTimelineItem
  className?: string
}) {
  const { promotedData, trackingPostfix, hasItems, item, className } = props
  const user = useUser()

  const contract =
    useFirebasePublicAndRealtimePrivateContract(
      props.contract.visibility,
      props.contract.id
    ) ?? props.contract

  // Note: if we ever make cards taller than viewport, we'll need to pass a lower threshold to the useIsVisible hook

  const { ref } = useIsVisible(
    () =>
      track('view market card', {
        contractId: contract.id,
        creatorId: contract.creatorId,
        slug: contract.slug,
        isPromoted: !!promotedData,
      } as ContractCardView),
    true
  )

  const trackClick = () =>
    track(('click market card ' + trackingPostfix).trim(), {
      contractId: contract.id,
      creatorId: contract.creatorId,
      slug: contract.slug,
      isPromoted: !!promotedData,
    })

  return (
    <div ref={ref}>
      {hasItems ? (
        <SimpleCard
          contract={contract}
          item={item}
          trackClick={trackClick}
          user={user}
          className={className}
        />
      ) : (
        <DetailedCard
          contract={contract}
          trackClick={trackClick}
          user={user}
          promotedData={promotedData}
          item={item}
          className={className}
        />
      )}
    </div>
  )
}

function SimpleCard(props: {
  contract: Contract
  trackClick: () => void
  user: User | null | undefined
  item?: FeedTimelineItem
  className?: string
}) {
  const { contract, user, item, trackClick, className } = props
  const { question, outcomeType, mechanism, closeTime, isResolved } = contract
  const isClosed = closeTime && closeTime < Date.now()
  const textColor = isClosed && !isResolved ? 'text-ink-600' : 'text-ink-900'
  const isBinaryCpmm = outcomeType === 'BINARY' && mechanism === 'cpmm-1'

  return (
    <Row className={clsx(className)}>
      <Col
        className={
          'dark:bg-canvas-50 border-ink-200 grow justify-between gap-2 overflow-hidden border border-l-4 px-3 pt-2'
        }
      >
        <Row className="items-start justify-between gap-1">
          <Col>
            <Row className={'items-start gap-2'}>
              <Link
                className={clsx(
                  'break-anywhere transition-color hover:text-primary-700 focus:text-primary-700 whitespace-normal outline-none',
                  textColor
                )}
                onClick={trackClick}
                href={contractPath(contract)}
              >
                {question}
              </Link>
            </Row>
          </Col>
          <Col className={'items-end'}>
            <Tooltip text={item?.reasonDescription} placement={'top'}>
              <ContractStatusLabel className={''} contract={contract} />
            </Tooltip>
          </Col>
        </Row>

        <Row className="text-ink-500 mb-1.5 w-full items-center justify-end gap-3 text-sm">
          {isBinaryCpmm && <BetRow contract={contract} user={user} />}
        </Row>
      </Col>
    </Row>
  )
}

function DetailedCard(props: {
  contract: Contract
  trackClick: () => void
  user: User | null | undefined
  promotedData?: { adId: string; reward: number }
  item?: FeedTimelineItem
  className?: string
}) {
  const { user, contract, trackClick, promotedData, item, className } = props
  const {
    closeTime,
    isResolved,
    creatorUsername,
    creatorAvatarUrl,
    question,
    outcomeType,
    mechanism,
  } = contract
  const isBinaryCpmm = outcomeType === 'BINARY' && mechanism === 'cpmm-1'
  const isClosed = closeTime && closeTime < Date.now()
  const textColor = isClosed && !isResolved ? 'text-ink-600' : 'text-ink-900'
  const [hidden, setHidden] = useState(false)
  const path = contractPath(contract)

  const probChange =
    contract.mechanism === 'cpmm-1' &&
    Math.abs(contract.probChanges.day) > 0.01 &&
    !contract.isResolved
      ? Math.round(contract.probChanges.day * 100)
      : 0
  const showChange =
    (item?.dataType === 'contract_probability_changed' ||
      item?.dataType === 'trending_contract') &&
    probChange != 0
  const metrics = useSavedContractMetrics(contract)
  if (hidden) return null
  return (
    <div
      className={clsx(
        className,
        'relative rounded-xl',
        'dark:bg-canvas-50 group flex cursor-pointer flex-col overflow-hidden',
        'border-canvas-100 hover:border-primary-300 focus:border-primary-300 border outline-none transition-colors'
      )}
      // we have other links inside this card like the username, so can't make the whole card a button or link
      tabIndex={-1}
      onClick={(e) => {
        trackClick()
        Router.push(path)
        e.currentTarget.focus() // focus the div like a button, for style
      }}
    >
      <Row className={clsx('grow gap-2 px-3 pt-4 pb-2')}>
        <Col className="w-full">
          <Col className="w-full gap-0.5">
            {/* Title is link to contract for open in new tab and a11y */}
            <Col onClick={(e) => e.stopPropagation()} className="w-full">
              <Col className={'w-full flex-col gap-1.5'}>
                <Row className={'justify-between gap-1'}>
                  <Link
                    href={path}
                    className={clsx(
                      '-mt-1 text-lg',
                      'break-anywhere transition-color hover:text-primary-700 focus:text-primary-700 whitespace-normal font-medium outline-none',
                      textColor
                    )}
                    // if open in new tab, don't open in this one
                    onClick={(e) => {
                      trackClick()
                      e.stopPropagation()
                    }}
                  >
                    {question}
                    {item &&
                      !item.isCopied &&
                      (item.dataType === 'contract_probability_changed' ||
                        item.dataType === 'trending_contract') && (
                        <div className={'text-ink-400 text-xs'}>
                          <Tooltip
                            text={item?.reasonDescription}
                            placement={'top'}
                          >
                            {item.dataType === 'contract_probability_changed'
                              ? ' moved'
                              : item.dataType === 'trending_contract'
                              ? ' trending'
                              : item.dataType === 'new_subsidy'
                              ? ' subsidized'
                              : ''}
                          </Tooltip>
                          <RelativeTimestamp
                            time={item.createdTime}
                            shortened={true}
                          />{' '}
                          ago
                        </div>
                      )}
                  </Link>
                  <Col className={'items-end'}>
                    {contract.outcomeType !== 'MULTIPLE_CHOICE' && (
                      <ContractStatusLabel
                        className={'-mt-1 text-lg font-bold'}
                        contract={contract}
                      />
                    )}
                    <span>
                      {showChange && (
                        <span
                          className={clsx(
                            'font-normal',
                            probChange! > 0
                              ? 'text-teal-500'
                              : 'text-scarlet-500'
                          )}
                        >
                          {probChange! > 0 ? '+' : ''}
                          {probChange}%
                        </span>
                      )}
                    </span>
                  </Col>
                </Row>
                <Row className={'items-center justify-between gap-1'}>
                  <Col>
                    <Row className={'items-center gap-1'}>
                      <Avatar
                        size={'xs'}
                        className={'mr-0.5'}
                        avatarUrl={creatorAvatarUrl}
                        username={creatorUsername}
                      />
                      <Row
                        className={'text-ink-700 items-baseline gap-1 text-sm'}
                      >
                        <UserLink
                          name={contract.creatorName}
                          username={creatorUsername}
                        />
                        {item &&
                          !item.isCopied &&
                          item.dataType === 'new_contract' && (
                            <span className={'text-xs'}>
                              <Tooltip
                                text={item?.reasonDescription}
                                placement={'top'}
                              >
                                asked
                              </Tooltip>
                              <RelativeTimestamp
                                time={item.createdTime}
                                shortened={true}
                                className="text-ink-600"
                              />
                            </span>
                          )}
                      </Row>
                    </Row>
                  </Col>
                  {isBinaryCpmm && !isClosed && (
                    <Col className="text-ink-500 items-center text-sm">
                      <BetRow contract={contract} user={user} />
                    </Col>
                  )}
                </Row>
              </Col>
            </Col>

            {contract.outcomeType === 'MULTIPLE_CHOICE' && (
              <Col className="mt-4" onClick={(e) => e.stopPropagation()}>
                <AnswersPanel
                  contract={contract}
                  onAnswerCommentClick={() => {
                    return undefined
                  }}
                  showResolver={false}
                />
              </Col>
            )}

            <Col className={'w-full items-center'}>
              {promotedData && (
                <ClaimButton
                  {...promotedData}
                  className={'z-10 my-2 whitespace-nowrap'}
                />
              )}
            </Col>

            {isBinaryCpmm && metrics && metrics.hasShares && (
              <YourMetricsFooter metrics={metrics} />
            )}

            <Row
              className="items-center justify-between pt-2"
              onClick={(e) => e.stopPropagation()}
            >
              <Col className={'w-full'}>
                <Row className={'items-center justify-between'}>
                  <TradesButton contract={contract} />
                  <CommentsButton contract={contract} user={user} />

                  <MoreOptionsButton
                    user={user}
                    contract={contract}
                    item={item}
                    onSetUninteresting={() => setHidden(true)}
                  />

                  <LikeButton
                    contentId={contract.id}
                    contentCreatorId={contract.creatorId}
                    user={user}
                    contentType={'contract'}
                    totalLikes={contract.likedByUserCount ?? 0}
                    contract={contract}
                    contentText={question}
                    size="md"
                    color="gray"
                    className="px-0"
                    trackingLocation={'contract card (feed)'}
                  />
                </Row>
              </Col>
            </Row>
          </Col>
        </Col>
      </Row>
    </div>
  )
}

const MoreOptionsButton = (props: {
  contract: Contract
  item: FeedTimelineItem | undefined
  user: User | null | undefined
  onSetUninteresting: () => void
}) => {
  const { contract, user, item, onSetUninteresting } = props
  if (!user) return null

  const markUninteresting = async () => {
    await updateUserDisinterestEmbedding({
      contractId: contract.id,
      creatorId: contract.creatorId,
      feedId: item?.id,
    })
    toast(`We won't show you content like that again`, {
      icon: <TiVolumeMute className={'h-5 w-5 text-teal-500'} />,
    })
    onSetUninteresting()
  }

  return (
    <Tooltip text={'Hide this market'}>
      <button
        className={clsx(
          'text-ink-500 hover:text-ink-600 flex flex-col justify-center transition-transform disabled:cursor-not-allowed'
        )}
        onClick={(e) => {
          e.preventDefault()
          if (
            confirm(
              `Are you sure you don't want to see more content like this?`
            )
          )
            markUninteresting()
        }}
      >
        <NoSymbolIcon className={'h-[1.4rem]'} />
      </button>
    </Tooltip>
  )
}

function YourMetricsFooter(props: { metrics: ContractMetric }) {
  const { metrics } = props
  const { totalShares, maxSharesOutcome, profit } = metrics
  const { YES: yesShares, NO: noShares } = totalShares

  return (
    <Row className="bg-ink-200/50 my-2 items-center gap-4 rounded p-2 text-sm">
      <Row className="items-center gap-2">
        <span className="text-ink-500">Payout on {maxSharesOutcome}</span>
        <span className="text-ink-700 font-semibold">
          {maxSharesOutcome === 'YES'
            ? formatMoney(yesShares)
            : formatMoney(noShares)}{' '}
        </span>
      </Row>
      <Row className="ml-auto items-center gap-2">
        <div className="text-ink-500">Profit </div>
        <div className={clsx('text-ink-700 font-semibold')}>
          {profit ? formatMoney(profit) : '--'}
        </div>
      </Row>
    </Row>
  )
}
