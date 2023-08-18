import clsx from 'clsx'

import { Contract, contractPath } from 'common/contract'
import { ContractMetric } from 'common/contract-metric'
import { ContractCardView } from 'common/events'
import { User } from 'common/user'
import { formatMoney } from 'common/util/format'
import { toast } from 'react-hot-toast'
import { FiThumbsDown } from 'react-icons/fi'
import { TiVolumeMute } from 'react-icons/ti'
import { ClaimButton } from 'web/components/ad/claim-ad-button'
import {
  ContractStatusLabel,
  VisibilityIcon,
} from 'web/components/contract/contracts-table'
import { Avatar } from 'web/components/widgets/avatar'
import { UserLink } from 'web/components/widgets/user-link'
import { useFirebasePublicContract } from 'web/hooks/use-contract-supabase'
import { FeedTimelineItem } from 'web/hooks/use-feed-timeline'
import { useIsVisible } from 'web/hooks/use-is-visible'
import { useSavedContractMetrics } from 'web/hooks/use-saved-contract-metrics'
import { useUser } from 'web/hooks/use-user'
import { updateUserDisinterestEmbedding } from 'web/lib/firebase/api'
import { track } from 'web/lib/service/analytics'
import { AnswersPanel } from '../answers/answers-panel'
import { BetButton } from '../bet/feed-bet-button'
import { CommentsButton } from '../comments/comments-button'
import { CardReason } from '../feed/card-reason'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { PollPanel } from '../poll/poll-panel'
import { LinkFrame } from '../widgets/click-frame'
import { Tooltip } from '../widgets/tooltip'
import { LikeButton } from './like-button'
import { TradesButton } from './trades-button'
import FeedContractCardDescription from '../feed/feed-contract-card-description'

export function FeedContractCard(props: {
  contract: Contract
  children?: React.ReactNode
  bottomChildren?: React.ReactNode
  promotedData?: { adId: string; reward: number }
  /** location of the card, to disambiguate card click events */
  trackingPostfix?: string
  item?: FeedTimelineItem
  className?: string
  hide?: () => void
}) {
  const {
    promotedData,
    trackingPostfix,
    item,
    className,
    children,
    bottomChildren,
    hide,
  } = props
  const user = useUser()

  const contract =
    useFirebasePublicContract(props.contract.visibility, props.contract.id) ??
    props.contract

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
      {children || bottomChildren ? (
        <SimpleCard
          contract={contract}
          item={item}
          trackClick={trackClick}
          user={user}
          className={className}
          bottomChildren={bottomChildren}
          hide={hide}
        >
          {children}
        </SimpleCard>
      ) : (
        <DetailedCard
          contract={contract}
          trackClick={trackClick}
          user={user}
          promotedData={promotedData}
          item={item}
          className={className}
          hide={hide}
        />
      )}
    </div>
  )
}

// TODO: merge with DetailedCard
function SimpleCard(props: {
  contract: Contract
  trackClick: () => void
  user: User | null | undefined
  children?: React.ReactNode
  bottomChildren?: React.ReactNode
  item?: FeedTimelineItem
  className?: string
  hide?: () => void
}) {
  const {
    contract,
    user,
    item,
    trackClick,
    className,
    children,
    bottomChildren,
    hide,
  } = props
  const { outcomeType, mechanism, closeTime, isResolved } = contract
  const isClosed = closeTime && closeTime < Date.now()
  const textColor = isClosed && !isResolved ? 'text-ink-600' : 'text-ink-900'
  const isBinaryCpmm = outcomeType === 'BINARY' && mechanism === 'cpmm-1'

  const path = contractPath(contract)

  return (
    <LinkFrame
      className={clsx(
        className,
        'bg-canvas-0 border-canvas-0 hover:border-primary-300 relative flex cursor-pointer flex-col justify-between gap-2 overflow-hidden rounded-xl border px-4 pt-2 drop-shadow-md transition-colors sm:px-6'
      )}
      onClick={(e) => {
        e.currentTarget.focus()
      }}
      href={path}
    >
      <div
        className={
          'flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4'
        }
      >
        <Row className="grow items-start text-lg">
          <VisibilityIcon contract={contract} /> {contract.question}
        </Row>
        <Col className="w-full sm:w-min sm:items-start">
          <Row className="w-full items-center justify-end gap-3 sm:w-min">
            <ContractStatusLabel
              className={'text-lg font-bold'}
              contract={contract}
            />
            {isBinaryCpmm && !isClosed && (
              <BetButton contract={contract} user={user} className="h-min" />
            )}
          </Row>
        </Col>
      </div>

      {children}
      <Col>
        <BottomActionRow
          contract={contract}
          item={item}
          user={user}
          hide={hide}
          underline={!!bottomChildren}
        />
        {bottomChildren}
      </Col>
    </LinkFrame>
  )
}

function DetailedCard(props: {
  contract: Contract
  trackClick: () => void
  user: User | null | undefined
  promotedData?: { adId: string; reward: number }
  item?: FeedTimelineItem
  hide?: () => void
  className?: string
}) {
  const { user, contract, trackClick, promotedData, item, hide, className } =
    props
  const {
    closeTime,
    isResolved,
    creatorUsername,
    creatorAvatarUrl,
    outcomeType,
    mechanism,
  } = contract
  const isBinaryCpmm = outcomeType === 'BINARY' && mechanism === 'cpmm-1'
  const isClosed = closeTime && closeTime < Date.now()
  const textColor = isClosed && !isResolved ? 'text-ink-600' : 'text-ink-900'
  const path = contractPath(contract)
  const metrics = useSavedContractMetrics(contract)
  return (
    <LinkFrame
      className={clsx(
        className,
        'relative rounded-xl',
        'bg-canvas-0 cursor-pointer overflow-hidden',
        'border-canvas-0 hover:border-primary-300 focus:border-primary-300 border drop-shadow-md transition-colors',
        'flex w-full flex-col gap-0.5 px-4 sm:px-6'
      )}
      onClick={(e) => {
        trackClick()
        e.currentTarget.focus() // focus the div like a button, for style
      }}
      href={path}
    >
      {/* Title is link to contract for open in new tab and a11y */}
      <Col className={'w-full flex-col gap-1.5 pt-2'}>
        <Row className="w-full justify-between">
          <Row className={'text-ink-500 items-center gap-1 text-sm'}>
            <Avatar
              size={'xs'}
              className={'mr-0.5'}
              avatarUrl={creatorAvatarUrl}
              username={creatorUsername}
            />
            <UserLink
              name={contract.creatorName}
              username={creatorUsername}
              className={clsx(
                'w-full max-w-[10rem] text-ellipsis sm:max-w-[12rem]'
              )}
            />
          </Row>
          <CardReason item={item} contract={contract} />
        </Row>
        <div
          className={
            'flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4'
          }
        >
          <Row className="grow items-start text-lg">
            <VisibilityIcon contract={contract} /> {contract.question}
          </Row>
          <Col className="w-full sm:w-min sm:items-start">
            <Row className="w-full items-center justify-end gap-3 sm:w-min">
              {contract.outcomeType !== 'MULTIPLE_CHOICE' && (
                <ContractStatusLabel
                  className={'text-lg font-bold'}
                  contract={contract}
                />
              )}
              {isBinaryCpmm && !isClosed && (
                <BetButton contract={contract} user={user} className="h-min" />
              )}
            </Row>
          </Col>
        </div>
      </Col>

      {contract.outcomeType === 'POLL' && (
        <div className="mt-2">
          <PollPanel contract={contract} maxOptions={4} />
        </div>
      )}
      {contract.outcomeType === 'MULTIPLE_CHOICE' && (
        <div className="mt-2" onClick={(e) => e.preventDefault()}>
          <AnswersPanel contract={contract} maxAnswers={4} linkToContract />
        </div>
      )}

      <Col className={'w-full items-center'}>
        {promotedData && (
          <ClaimButton
            {...promotedData}
            className={'z-10 my-2 whitespace-nowrap'}
          />
        )}
      </Col>

      {item?.dataType == 'new_contract' && (
        <FeedContractCardDescription contract={contract} />
      )}

      {isBinaryCpmm && metrics && metrics.hasShares && (
        <YourMetricsFooter metrics={metrics} />
      )}
      <BottomActionRow
        contract={contract}
        item={item}
        user={user}
        hide={hide}
      />
    </LinkFrame>
  )
}

const BottomActionRow = (props: {
  contract: Contract
  item: FeedTimelineItem | undefined
  user: User | null | undefined
  underline?: boolean
  hide?: () => void
}) => {
  const { contract, user, item, hide, underline } = props
  const { question } = contract
  return (
    <Row
      className={clsx(
        'items-center justify-between pt-2',
        underline ? 'border-1 border-ink-200 border-b pb-3' : 'pb-2'
      )}
    >
      <TradesButton contract={contract} />
      <CommentsButton contract={contract} user={user} />
      {hide && (
        <DislikeButton
          user={user}
          contract={contract}
          item={item}
          interesting={true}
          toggleInteresting={hide}
        />
      )}
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
  )
}

export const DislikeButton = (props: {
  contract: Contract
  item: FeedTimelineItem | undefined
  user: User | null | undefined
  interesting: boolean
  toggleInteresting: () => void
  className?: string
}) => {
  const { contract, className, user, interesting, item, toggleInteresting } =
    props
  if (!user) return null

  const markUninteresting = async () => {
    await updateUserDisinterestEmbedding({
      contractId: contract.id,
      creatorId: contract.creatorId,
      feedId: item?.id,
      // Currently not interesting, toggling to interesting
      removeContract: !interesting,
    })
    if (interesting)
      toast(`We won't show you content like that again`, {
        icon: <TiVolumeMute className={'h-5 w-5 text-teal-500'} />,
      })
    toggleInteresting()
  }

  return (
    <Tooltip text={'Show less of this'} className={className}>
      <button
        className={clsx(
          'text-ink-500 hover:text-ink-600 flex flex-col justify-center transition-transform disabled:cursor-not-allowed'
        )}
        onClick={(e) => {
          e.preventDefault()
          markUninteresting()
        }}
      >
        <FiThumbsDown
          className={clsx('h-5 w-5', !interesting ? 'text-primary-500' : '')}
        />
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
