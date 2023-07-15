import { JSONContent } from '@tiptap/core'
import clsx from 'clsx'
import Image from 'next/image'
import Link from 'next/link'
import { memo, ReactNode } from 'react'

import { Contract, contractPath, CPMMContract } from 'common/contract'
import { ContractMetric } from 'common/contract-metric'
import { Group } from 'common/group'
import { STONK_NO, STONK_YES } from 'common/stonk'
import { formatMoney } from 'common/util/format'
import { richTextToString } from 'common/util/parse'
import { DAY_MS } from 'common/util/time'
import { getLinkTarget } from 'web/components/widgets/site-link'
import { useSavedContractMetrics } from 'web/hooks/use-saved-contract-metrics'
import { useUser } from 'web/hooks/use-user'
import { track, trackCallback } from 'web/lib/service/analytics'
import { QuickBet, QuickOutcomeView } from '../bet/quick-bet'
import { GroupContractOptions } from '../groups/group-contract-options'
import { groupRoleType } from '../groups/group-member-modal'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Spacer } from '../layout/spacer'
import { Avatar } from '../widgets/avatar'
import { Card } from '../widgets/card'
import { Tooltip } from '../widgets/tooltip'
import { UserLink } from '../widgets/user-link'
import { MiscDetails, ShowTime } from './contract-details'
import { ProbOrNumericChange } from './prob-change-table'
import { useRealtimeContract } from 'web/hooks/use-contract-supabase'

export const ContractCard = memo(function ContractCard(props: {
  contract: Contract
  showTime?: ShowTime
  className?: string
  questionClass?: string
  onClick?: () => void
  hideQuickBet?: boolean
  hideGroupLink?: boolean
  trackingPostfix?: string
  noLinkAvatar?: boolean
  newTab?: boolean
  showImage?: boolean
  showDescription?: boolean
  children?: ReactNode
  pinned?: boolean
  hideQuestion?: boolean
  hideDetails?: boolean
  numAnswersFR?: number
  fromGroupProps?: {
    group: Group
    userRole: groupRoleType | null
  }
}) {
  const {
    showTime,
    className,
    questionClass,
    onClick,
    hideQuickBet,
    hideGroupLink,
    trackingPostfix,
    noLinkAvatar,
    newTab,
    showImage,
    showDescription,
    children,
    pinned,
    hideQuestion,
    hideDetails,
    numAnswersFR,
    fromGroupProps,
  } = props
  const contract = useRealtimeContract(props.contract.id) ?? props.contract
  const { isResolved, createdTime, featuredLabel, creatorCreatedTime } =
    contract
  const { question, outcomeType } = contract
  const { resolution } = contract

  const user = useUser()
  const marketClosed =
    (contract.closeTime || Infinity) < Date.now() || !!resolution

  const showBinaryQuickBet =
    !marketClosed &&
    (outcomeType === 'BINARY' ||
      outcomeType === 'PSEUDO_NUMERIC' ||
      outcomeType === 'STONK') &&
    !hideQuickBet

  const isNew = createdTime > Date.now() - DAY_MS && !isResolved
  const hasImage = contract.coverImageUrl && showImage
  const href = contractPath(contract)
  return (
    <Card
      className={clsx(
        'group relative flex w-full leading-normal',
        hasImage ? 'ub-cover-image' : '',
        className
      )}
    >
      <Col className="relative flex-1 gap-1 pt-2">
        {!hideDetails && (
          <Row className="justify-between px-4">
            <Row className="z-10 items-center gap-2">
              <Avatar
                username={contract.creatorUsername}
                avatarUrl={contract.creatorAvatarUrl}
                size={'2xs'}
                noLink={noLinkAvatar}
              />
              <UserLink
                name={contract.creatorName}
                username={contract.creatorUsername}
                noLink={noLinkAvatar}
                className="text-ink-400 text-sm"
                createdTime={creatorCreatedTime}
              />
            </Row>
            <Row className="gap-1">
              {pinned && <FeaturedPill label={featuredLabel} />}
              {/* {isNew && <NewContractBadge />} */}
              {fromGroupProps &&
                fromGroupProps.userRole &&
                (fromGroupProps.userRole == 'admin' ||
                  fromGroupProps.userRole == 'moderator') && (
                  <div className="z-20">
                    <GroupContractOptions
                      group={fromGroupProps.group}
                      contract={contract}
                    />
                  </div>
                )}
            </Row>
          </Row>
        )}
        {/* overlay question on image */}
        {hasImage && !hideQuestion && (
          <div className="relative mb-2">
            <div className="relative h-36">
              <Image
                fill
                alt={contract.question}
                sizes="100vw"
                className="object-cover"
                src={contract.coverImageUrl ?? ''}
              />
            </div>
            <div className="absolute bottom-0 w-full">
              <div
                className={clsx(
                  'break-anywhere bg-gradient-to-t from-black px-4 pb-2 pt-12 text-xl font-semibold text-white',
                  questionClass
                )}
              >
                <div className="drop-shadow-lg">{question}</div>
              </div>
            </div>
          </div>
        )}

        <Col className="gap-1 px-4 pb-1">
          {/* question is here if not overlaid on an image */}
          {!hasImage && !hideQuestion && (
            <div
              className={clsx(
                'break-anywhere text-md text-ink-900 pb-2 font-medium',
                questionClass
              )}
            >
              {question}
            </div>
          )}
          {showBinaryQuickBet ? (
            <QuickBet contract={contract} user={user} className="z-10" />
          ) : (
            <QuickOutcomeView contract={contract} numAnswersFR={numAnswersFR} />
          )}
        </Col>

        {showDescription && (
          <DescriptionRow description={contract.description} />
        )}

        <Row className={clsx('gap-1 px-4', children ? '' : 'mb-2')}>
          <MiscDetails
            contract={contract}
            showTime={showTime}
            hideGroupLink={hideGroupLink}
          />

          {!isNew &&
            (outcomeType === 'BINARY' ||
              outcomeType === 'PSEUDO_NUMERIC' ||
              outcomeType === 'STONK') && (
              <Tooltip text={'Daily price change'} className={'z-10'}>
                <ProbOrNumericChange
                  className="py-2 px-2"
                  contract={contract as CPMMContract}
                  user={user}
                />
              </Tooltip>
            )}
        </Row>
        {children}
      </Col>

      {/* Add click layer */}
      {onClick ? (
        <a
          className="absolute top-0 left-0 right-0 bottom-0"
          href={href}
          onClick={(e) => {
            // Let the browser handle the link click (opens in new tab).
            if (e.ctrlKey || e.metaKey) {
              track('click market card' + (trackingPostfix ?? ''), {
                slug: contract.slug,
                contractId: contract.id,
              })
            } else {
              e.preventDefault()
              onClick()
            }
          }}
        />
      ) : (
        <Link
          href={href}
          onClick={trackCallback(
            'click market card' + (trackingPostfix ?? ''),
            {
              slug: contract.slug,
              contractId: contract.id,
            }
          )}
          className="absolute top-0 left-0 right-0 bottom-0"
          target={newTab ? getLinkTarget(href, newTab) : '_self'}
        />
      )}
    </Card>
  )
})

function DescriptionRow(props: { description: string | JSONContent }) {
  const { description } = props

  const descriptionString =
    typeof description === 'string'
      ? description
      : richTextToString(description)

  return (
    <Row className="px-4 pb-1">
      <div className="break-anywhere line-clamp-6 text-sm font-thin">
        {descriptionString}
      </div>
    </Row>
  )
}

export function ContractMetricsFooter(props: {
  contract: CPMMContract
  showDailyProfit?: boolean
}) {
  const { contract, showDailyProfit } = props

  const user = useUser()
  const metrics = useSavedContractMetrics(contract)

  return user && metrics && metrics.hasShares ? (
    <LoadedMetricsFooter
      contract={contract}
      metrics={metrics}
      showDailyProfit={showDailyProfit}
    />
  ) : (
    <Spacer h={2} />
  )
}

function LoadedMetricsFooter(props: {
  contract: CPMMContract
  metrics: ContractMetric
  showDailyProfit?: boolean
}) {
  const { contract, metrics, showDailyProfit } = props
  const { totalShares, maxSharesOutcome, from } = metrics
  const { YES: yesShares, NO: noShares } = totalShares
  const dailyProfit = from ? from.day.profit : 0
  const profit = showDailyProfit ? dailyProfit : metrics.profit
  const { outcomeType } = contract

  const yesOutcomeLabel =
    outcomeType === 'PSEUDO_NUMERIC'
      ? 'HIGHER'
      : outcomeType === 'STONK'
      ? STONK_YES
      : 'YES'
  const noOutcomeLabel =
    outcomeType === 'PSEUDO_NUMERIC'
      ? 'LOWER'
      : outcomeType === 'STONK'
      ? STONK_NO
      : 'NO'

  return (
    <div className="bg-ink-100 columns-2 items-center gap-4 rounded-b-[7px] px-4 pt-1 pb-2 text-sm">
      <Col>
        <span className="text-ink-400 text-xs">Payout</span>
        <div className="text-ink-600 text-sm">
          <span className="font-semibold">
            {maxSharesOutcome === 'YES'
              ? formatMoney(yesShares)
              : formatMoney(noShares)}{' '}
          </span>
          on {maxSharesOutcome === 'YES' ? yesOutcomeLabel : noOutcomeLabel}
        </div>
      </Col>
      <Col>
        <div className="text-ink-400 text-xs">
          {' '}
          {showDailyProfit ? 'daily' : 'total'} Profit{' '}
        </div>
        <div className={clsx('text-ink-600 text-sm font-semibold')}>
          {profit ? formatMoney(profit) : '--'}
        </div>
      </Col>
    </div>
  )
}

export function FeaturedPill(props: { label?: string }) {
  const label = props.label ?? 'Featured'
  return (
    <div className="from-primary-500 rounded-full bg-gradient-to-br to-fuchsia-500 px-2 text-white">
      {label}
    </div>
  )
}
