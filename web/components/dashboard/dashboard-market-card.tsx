import clsx from 'clsx'
import { Answer } from 'common/answer'
import { getCpmmProbability } from 'common/calculate-cpmm'
import {
  CPMMContract,
  Contract,
  PseudoNumericContract,
} from 'common/contract'
import { PollOption } from 'common/poll-option'
import { formatNumericProbability } from 'common/pseudo-numeric'
import { shortFormatNumber } from 'common/util/format'
import { TbDroplet } from 'react-icons/tb'
import { getAnswerColor } from 'web/components/charts/contract/choice'
import { RepostButton } from 'web/components/comments/repost-modal'
import { TradesButton } from 'web/components/contract/trades-button'
import { ReactButton } from 'web/components/contract/react-button'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Tooltip } from 'web/components/widgets/tooltip'
import { useUser } from 'web/hooks/use-user'

type MarketMeta = {
  label: string
  badgeBg: string
  badgeText: string
  accentText: string
}

function marketMeta(outcomeType: string): MarketMeta {
  switch (outcomeType) {
    case 'BINARY':
      return {
        label: 'Binary',
        badgeBg: 'bg-indigo-100 dark:bg-indigo-900/40',
        badgeText: 'text-indigo-700 dark:text-indigo-300',
        accentText: 'text-indigo-500 dark:text-indigo-400',
      }
    case 'MULTIPLE_CHOICE':
      return {
        label: 'Multiple choice',
        badgeBg: 'bg-violet-100 dark:bg-violet-900/40',
        badgeText: 'text-violet-700 dark:text-violet-300',
        accentText: 'text-violet-600 dark:text-violet-400',
      }
    case 'PSEUDO_NUMERIC':
    case 'NUMBER':
    case 'MULTI_NUMERIC':
    case 'DATE':
      return {
        label: 'Numeric',
        badgeBg: 'bg-blue-100 dark:bg-blue-900/40',
        badgeText: 'text-blue-700 dark:text-blue-300',
        accentText: 'text-blue-600 dark:text-blue-400',
      }
    case 'POLL':
      return {
        label: 'Poll',
        badgeBg: 'bg-teal-100 dark:bg-teal-900/40',
        badgeText: 'text-teal-700 dark:text-teal-300',
        accentText: 'text-teal-600 dark:text-teal-400',
      }
    case 'BOUNTIED_QUESTION':
      return {
        label: 'Bounty',
        badgeBg: 'bg-amber-100 dark:bg-amber-900/40',
        badgeText: 'text-amber-700 dark:text-amber-300',
        accentText: 'text-amber-600 dark:text-amber-400',
      }
    case 'STONK':
      return {
        label: 'Stock',
        badgeBg: 'bg-orange-100 dark:bg-orange-900/40',
        badgeText: 'text-orange-700 dark:text-orange-300',
        accentText: 'text-orange-600 dark:text-orange-400',
      }
    default:
      return {
        label: 'Market',
        badgeBg: 'bg-gray-100 dark:bg-gray-800',
        badgeText: 'text-gray-600 dark:text-gray-400',
        accentText: 'text-gray-500 dark:text-gray-400',
      }
  }
}

export function DashboardMarketCard({
  contract,
  trackingLocation = 'dashboard',
}: {
  contract: Contract
  trackingLocation?: string
}) {
  const user = useUser()
  const meta = marketMeta(contract.outcomeType)
  const isBinary = contract.outcomeType === 'BINARY'
  const isMulti = contract.outcomeType === 'MULTIPLE_CHOICE'
  const isPseudoNumeric = contract.outcomeType === 'PSEUDO_NUMERIC'
  const isNumericBuckets =
    contract.outcomeType === 'NUMBER' ||
    contract.outcomeType === 'MULTI_NUMERIC' ||
    contract.outcomeType === 'DATE'
  const isPoll = contract.outcomeType === 'POLL'

  const cpmmContract = isBinary ? (contract as CPMMContract) : null
  const pseudoContract = isPseudoNumeric
    ? (contract as CPMMContract & PseudoNumericContract)
    : null
  const answers = (isMulti || isNumericBuckets)
    ? ((contract as { answers?: Answer[] }).answers ?? [])
    : []
  const pollOptions = isPoll
    ? (contract as { options?: PollOption[] }).options
    : undefined

  const binaryProb = cpmmContract ? Math.round(cpmmContract.prob * 100) : null

  const nonOtherAnswers = answers.filter((a) => !a.isOther)
  const otherAnswer = answers.find((a) => a.isOther)
  const topThree = [...nonOtherAnswers].sort((a, b) => b.prob - a.prob).slice(0, 3)

  const contractUrl = `/${contract.creatorUsername}/${contract.slug}`
  const hasLiquidity = 'totalLiquidity' in contract

  return (
    <div className="bg-canvas-50 border-canvas-100 relative flex h-full flex-col overflow-hidden rounded-xl border">
      {/* Header: creator + market type badge */}
      <Row className="items-center justify-between gap-2 px-4 pt-4 pb-2">
        <a
          href={`/${contract.creatorUsername}`}
          className="flex min-w-0 items-center gap-2 hover:opacity-70"
        >
          <img
            src={contract.creatorAvatarUrl ?? '/default-avatar.png'}
            alt=""
            className="h-6 w-6 shrink-0 rounded-full object-cover"
          />
          <span className="text-ink-500 truncate text-[13px]">
            @{contract.creatorUsername}
          </span>
        </a>
        <span
          className={clsx(
            'shrink-0 rounded px-2 py-0.5 text-xs font-semibold',
            meta.badgeBg,
            meta.badgeText
          )}
        >
          {meta.label}
        </span>
      </Row>

      {/* Question title */}
      <a href={contractUrl} className="px-4 pb-2 pt-0.5 hover:opacity-80">
        <p className="text-ink-900 line-clamp-2 text-[15px] font-semibold leading-snug">
          {contract.question}
        </p>
      </a>

      {/* Market-type-specific content */}
      <div className="min-h-0 flex-1 overflow-hidden px-4 pb-3 pt-1">
        {isBinary && cpmmContract && (
          <Col className="gap-1 py-1">
            {contract.resolution && contract.resolution !== 'CANCEL' ? (
              <>
                <span
                  className={clsx(
                    'text-3xl font-bold',
                    contract.resolution === 'YES'
                      ? 'text-teal-500'
                      : 'text-rose-500'
                  )}
                >
                  {contract.resolution} ✓
                </span>
                <span className="text-ink-400 text-[13px]">resolved</span>
              </>
            ) : (
              <>
                <span className={clsx('text-4xl font-bold', meta.accentText)}>
                  {binaryProb}%
                </span>
                <span className="text-ink-400 text-[13px]">chance of yes</span>
              </>
            )}
          </Col>
        )}

        {isMulti && topThree.length > 0 && (
          <Col className="gap-2 py-1">
            {topThree.map((a) => {
              const pct = Math.round(a.prob * 100)
              const isWinner = a.resolution === 'YES'
              const barColor = getAnswerColor(a)
              return (
                <Row key={a.id} className="items-center gap-3">
                  <span className="text-ink-700 w-2/5 shrink-0 truncate text-[13px] leading-tight">
                    {a.text}
                  </span>
                  <div
                    className="bg-ink-200 flex-1 overflow-hidden rounded-full"
                    style={{ height: '8px' }}
                  >
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: barColor }}
                    />
                  </div>
                  <span
                    className={clsx(
                      'w-8 shrink-0 text-right text-[13px] font-medium',
                      isWinner ? 'text-teal-500' : 'text-ink-500'
                    )}
                  >
                    {isWinner ? '✓' : `${pct}%`}
                  </span>
                </Row>
              )
            })}
            {(() => {
              const moreCount =
                Math.max(0, nonOtherAnswers.length - 3) + (otherAnswer ? 1 : 0)
              return moreCount > 0 ? (
                <a
                  href={contractUrl}
                  className="text-ink-400 hover:text-ink-600 text-[13px] transition-colors"
                >
                  +{moreCount} more →
                </a>
              ) : null
            })()}
          </Col>
        )}

        {isPseudoNumeric && pseudoContract && (() => {
          const prob =
            pseudoContract.pool && pseudoContract.p != null
              ? getCpmmProbability(pseudoContract.pool, pseudoContract.p)
              : pseudoContract.prob
          const hasRange = prob !== undefined && pseudoContract.min !== undefined
          const resolveProb = contract.resolutionProbability ?? prob
          return (
            <Col className="gap-1 py-1">
              {contract.resolution ? (
                <>
                  <span className="text-ink-900 text-3xl font-bold">
                    {hasRange && resolveProb !== undefined
                      ? formatNumericProbability(resolveProb, pseudoContract)
                      : contract.resolution}
                  </span>
                  <span className="text-ink-400 text-[13px]">resolved</span>
                </>
              ) : (
                <span className="text-ink-900 text-4xl font-bold">
                  {hasRange && prob !== undefined
                    ? formatNumericProbability(prob, pseudoContract)
                    : prob !== undefined
                    ? `${Math.round(prob * 100)}%`
                    : '—'}
                </span>
              )}
            </Col>
          )
        })()}

        {isNumericBuckets && (() => {
          const topAnswer =
            nonOtherAnswers.length > 0
              ? [...nonOtherAnswers].sort((a, b) => b.prob - a.prob)[0]
              : null
          if (!topAnswer) return null
          const pct = Math.round(topAnswer.prob * 100)
          const isResolved =
            !!contract.resolution || topAnswer.resolution === 'YES'
          return (
            <Col className="gap-1 py-1">
              <span
                className={clsx('text-2xl font-bold leading-tight', meta.accentText)}
              >
                {topAnswer.text}
              </span>
              <span className="text-ink-400 text-[13px]">
                {isResolved ? 'resolved' : `${pct}% chance`}
              </span>
            </Col>
          )
        })()}

        {isPoll && pollOptions && pollOptions.length > 0 && (
          <Col className="gap-1.5 py-1">
            {pollOptions.slice(0, 3).map((o) => (
              <Row key={o.id} className="items-center gap-2">
                <div className="bg-ink-300 h-1.5 w-1.5 shrink-0 rounded-full" />
                <span className="text-ink-600 truncate text-[13px] leading-tight">
                  {o.text}
                </span>
              </Row>
            ))}
            {pollOptions.length > 3 && (
              <a
                href={contractUrl}
                className="text-ink-400 hover:text-ink-600 text-[13px] transition-colors"
              >
                +{pollOptions.length - 3} more →
              </a>
            )}
          </Col>
        )}
      </div>

      {/* Footer: engagement buttons */}
      <Row className="border-ink-100 items-center gap-0.5 border-t px-4 py-1.5">
        <TradesButton contract={contract} size="sm" />
        {hasLiquidity && (
          <Button disabled size="2xs" color="gray-white">
            <Tooltip text="Total liquidity" placement="top" noTap>
              <Row className="text-ink-500 items-center gap-1">
                <TbDroplet className="h-5 w-5 stroke-2" />
                <span className="text-ink-600 text-[13px]">
                  {shortFormatNumber(
                    (contract as CPMMContract).totalLiquidity
                  )}
                </span>
              </Row>
            </Tooltip>
          </Button>
        )}
        <RepostButton
          playContract={contract}
          size="2xs"
          iconClassName="text-ink-500"
        />
        <ReactButton
          contentId={contract.id}
          contentCreatorId={contract.creatorId}
          user={user}
          contentType="contract"
          contentText={contract.question}
          size="2xs"
          trackingLocation={trackingLocation}
          placement="top"
          contractId={contract.id}
          heartClassName="stroke-ink-500"
        />
      </Row>
    </div>
  )
}
