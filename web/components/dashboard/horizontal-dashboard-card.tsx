import clsx from 'clsx'
import Link from 'next/link'
import Router from 'next/router'
import { Contract, contractPath, isBinaryMulti } from 'common/contract'
import { ContractCardView } from 'common/events'
import { BinaryMultiAnswersPanel } from 'web/components/answers/binary-multi-answers-panel'
import {
  ContractStatusLabel,
  VisibilityIcon,
} from 'web/components/contract/contracts-table'
import { useLiveContract } from 'web/hooks/use-contract'
import { useIsVisible } from 'web/hooks/use-is-visible'
import { track } from 'web/lib/service/analytics'
import { getMarketMovementInfo } from 'web/lib/supabase/feed-timeline/feed-market-movement-display'
import { FeedBinaryChart } from '../feed/feed-chart'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { PollPanel } from '../poll/poll-panel'
import { ClickFrame } from '../widgets/click-frame'
import { SmallAnswerBars } from '../answers/small-answer'
import { BinaryBetButton } from '../us-elections/contracts/conditional-market/conditional-market'
import { capitalize } from 'lodash'
import { SWEEPIES_NAME } from 'common/envs/constants'
import { SweepiesCoin } from 'web/public/custom-components/sweepiesCoin'

export function HorizontalDashboardCard(props: {
  contract: Contract
  children?: React.ReactNode
  promotedData?: { adId: string; reward: number }
  /** location of the card, to disambiguate card click events */
  trackingPostfix?: string
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
    className,
    showGraph,
    size = 'md',
  } = props

  const contract = useLiveContract(props.contract)

  const { closeTime, outcomeType, mechanism } = contract
  const isBinaryMc = isBinaryMulti(contract)
  const isBinaryCpmm = outcomeType === 'BINARY' && mechanism === 'cpmm-1'
  const isClosed = closeTime && closeTime < Date.now()
  const path = contractPath(contract)

  // Note: if we ever make cards taller than viewport, we'll need to pass a lower threshold to the useIsVisible hook

  const { ref } = useIsVisible(
    () => {
      track('view market card', {
        contractId: contract.id,
        creatorId: contract.creatorId,
        slug: contract.slug,
        isPromoted: !!promotedData,
      } as ContractCardView)
    },
    false,
    true
  )

  const { startTime, ignore } = getMarketMovementInfo(contract)

  const trackClick = () =>
    track(('click market card ' + trackingPostfix).trim(), {
      contractId: contract.id,
      creatorId: contract.creatorId,
      slug: contract.slug,
      isPromoted: !!promotedData,
    })

  const isCashContract = contract.token == 'CASH'

  return (
    <ClickFrame
      className={clsx(
        'mt-3',
        isCashContract &&
          'ml-[1px] ring-1 ring-amber-200 hover:ring-amber-400 dark:ring-amber-400 hover:dark:ring-amber-200',
        'group relative flex w-full cursor-pointer flex-col justify-between gap-0.5 rounded-xl px-4 py-2',
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
      {isCashContract && (
        <div
          className={clsx(
            'absolute right-3 top-0 z-40 -translate-y-1/2 transform bg-amber-200 text-amber-700',
            'rounded-full px-2 py-0.5 text-xs font-semibold'
          )}
        >
          <span>
            <SweepiesCoin className="-mt-0.5" /> {capitalize(SWEEPIES_NAME)}{' '}
            Market
          </span>
        </div>
      )}
      <Col className={clsx('w-full pt-2', size === 'xs' ? '' : 'gap-1.5 ')}>
        {/* Title is link to contract for open in new tab and a11y */}
        <Link
          className="group-hover:text-primary-700 grow items-start transition-colors group-hover:underline sm:text-lg"
          href={path}
          onClick={trackClick}
        >
          <VisibilityIcon contract={contract} /> {contract.question}
        </Link>
      </Col>
      <Col>
        <Row className="w-full items-center justify-end gap-3 whitespace-nowrap">
          {contract.outcomeType !== 'MULTIPLE_CHOICE' && (
            <ContractStatusLabel
              className="text-lg font-bold"
              contract={contract}
            />
          )}
          {isBinaryCpmm && !isClosed && <BinaryBetButton contract={contract} />}
        </Row>
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
            <SmallAnswerBars
              contract={contract}
              maxAnswers={3}
              className="mb-4"
            />
          )}

          {isBinaryMc &&
            contract.mechanism === 'cpmm-multi-1' &&
            contract.outcomeType !== 'NUMBER' &&
            contract.outcomeType !== 'MULTI_NUMERIC' &&
            contract.outcomeType !== 'DATE' && (
              <BinaryMultiAnswersPanel contract={contract} />
            )}

          {isBinaryCpmm && (showGraph || !ignore) && (
            <FeedBinaryChart
              contract={contract}
              className="mb-8 mt-2"
              startDate={startTime ? startTime : contract.createdTime}
            />
          )}
        </div>
      </Col>
    </ClickFrame>
  )
}
