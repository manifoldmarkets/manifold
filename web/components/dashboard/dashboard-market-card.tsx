import clsx from 'clsx'
import Link from 'next/link'
import {
  BinaryContract,
  CPMMContract,
  CPMMMultiContract,
  Contract,
  PseudoNumericContract,
  contractPath,
} from 'common/contract'
import { getCpmmProbability } from 'common/calculate-cpmm'
import { PollOption } from 'common/poll-option'
import { formatNumericProbability } from 'common/pseudo-numeric'
import { shortFormatNumber } from 'common/util/format'
import { TbDroplet } from 'react-icons/tb'
import { SimpleAnswerBars } from 'web/components/answers/answers-panel'
import { FeedBinaryChart } from 'web/components/feed/feed-chart'
import { BetButton } from 'web/components/bet/feed-bet-button'
import { RepostButton } from 'web/components/comments/repost-modal'
import { TradesButton } from 'web/components/contract/trades-button'
import { ReactButton } from 'web/components/contract/react-button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { useUser } from 'web/hooks/use-user'
import { useLiveContract } from 'web/hooks/use-contract'

type MarketMeta = {
  label: string
  badgeClass: string
}

function marketMeta(outcomeType: string): MarketMeta {
  switch (outcomeType) {
    case 'BINARY':
      return { label: 'Yes/No', badgeClass: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300' }
    case 'MULTIPLE_CHOICE':
      return { label: 'Multiple choice', badgeClass: 'bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-300' }
    case 'PSEUDO_NUMERIC':
    case 'NUMBER':
    case 'MULTI_NUMERIC':
    case 'DATE':
      return { label: 'Numeric', badgeClass: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300' }
    case 'POLL':
      return { label: 'Poll', badgeClass: 'bg-teal-100 text-teal-600 dark:bg-teal-900/40 dark:text-teal-300' }
    case 'BOUNTIED_QUESTION':
      return { label: 'Bounty', badgeClass: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300' }
    case 'STONK':
      return { label: 'Stock', badgeClass: 'bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-300' }
    default:
      return { label: 'Market', badgeClass: 'bg-ink-100 text-ink-500' }
  }
}

function statusLabel(contract: Contract): string | null {
  if (contract.resolution) return 'Resolved'
  if (contract.closeTime && contract.closeTime < Date.now()) return 'Closed'
  return null
}

export function DashboardMarketCard({
  contract: initialContract,
  trackingLocation = 'dashboard',
}: {
  contract: Contract
  trackingLocation?: string
}) {
  const contract = useLiveContract(initialContract)
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
  const binaryContract = isBinary ? (contract as BinaryContract) : null
  const multiContract = (isMulti || isNumericBuckets) ? (contract as CPMMMultiContract) : null
  const pseudoContract = isPseudoNumeric
    ? (contract as CPMMContract & PseudoNumericContract)
    : null
  const pollOptions = isPoll
    ? (contract as { options?: PollOption[] }).options
    : undefined

  const binaryProb = cpmmContract ? Math.round(cpmmContract.prob * 100) : null
  const resolved = !!contract.resolution
  const liquidity = 'totalLiquidity' in contract ? (contract as CPMMContract).totalLiquidity ?? 0 : 0
  const status = statusLabel(contract)
  const contractUrl = contractPath(contract)

  return (
    <div
      className={clsx(
        'bg-canvas-50 border-ink-200 flex h-[340px] flex-col rounded-xl border transition-colors',
        resolved ? 'opacity-70' : 'hover:border-ink-300'
      )}
    >
      {/* Top row: status + type badge */}
      <Row className="items-center justify-between gap-2 px-5 pt-6">
        {status && (
          <span className="text-ink-400 text-[11px]">{status}</span>
        )}
        <span className={clsx('rounded px-1.5 py-0.5 text-[11px] font-medium', meta.badgeClass)}>
          {meta.label}
        </span>
      </Row>

      {/* Question title */}
      <Link href={contractUrl} className="px-5 pt-2.5 hover:opacity-80">
        <p className="text-ink-900 line-clamp-2 text-base font-semibold leading-snug">
          {contract.question}
        </p>
      </Link>

      {/* Market-type content */}
      <div className="min-h-0 flex-1 overflow-hidden px-5 pt-5 pb-2">
        {isBinary && cpmmContract && binaryContract && (
          resolved ? (
            <span className={clsx(
              'text-2xl font-bold',
              contract.resolution === 'YES' ? 'text-teal-500' : contract.resolution === 'NO' ? 'text-rose-500' : 'text-ink-400'
            )}>
              {contract.resolution === 'CANCEL' ? 'N/A' : contract.resolution} ✓
            </span>
          ) : (
            <Col className="h-full gap-0">
              <Row className="items-center justify-between pb-2">
                <Row className="items-baseline gap-1.5">
                  <span className="text-ink-900 text-2xl font-bold leading-[2rem]">{binaryProb}%</span>
                  <span className="text-ink-400 text-[11px]">chance</span>
                </Row>
                <div className="-mt-3">
                  <BetButton
                    contract={binaryContract!}
                    user={user}
                    labels={{ yes: 'Yes', no: 'No' }}
                  />
                </div>
              </Row>
              <FeedBinaryChart
                contract={binaryContract}
                className="h-[120px] w-full"
                startDate={contract.createdTime}
              />
            </Col>
          )
        )}

        {multiContract && (
          <SimpleAnswerBars
            contract={multiContract}
            maxAnswers={3}
          />
        )}

        {isPseudoNumeric && pseudoContract && (() => {
          const prob = pseudoContract.pool && pseudoContract.p != null
            ? getCpmmProbability(pseudoContract.pool, pseudoContract.p)
            : pseudoContract.prob
          const resolveProb = contract.resolutionProbability ?? prob
          return (
            <Row className="items-baseline gap-1.5">
              <span className="text-ink-900 text-2xl font-bold">
                {contract.resolution
                  ? formatNumericProbability(resolveProb!, pseudoContract)
                  : prob !== undefined ? formatNumericProbability(prob, pseudoContract) : '—'}
              </span>
              {contract.resolution && <span className="text-ink-400 text-[11px]">resolved</span>}
            </Row>
          )
        })()}

        {isPoll && pollOptions && pollOptions.length > 0 && (
          <Col className="gap-1.5">
            {pollOptions.slice(0, 5).map((o) => (
              <Row key={o.id} className="items-center gap-2">
                <div className="bg-ink-300 h-1.5 w-1.5 shrink-0 rounded-full" />
                <span className="text-ink-600 truncate text-sm leading-tight">{o.text}</span>
              </Row>
            ))}
            {pollOptions.length > 5 && (
              <Link href={contractUrl} className="text-ink-400 hover:text-ink-600 text-[11px] transition-colors">
                +{pollOptions.length - 5} more →
              </Link>
            )}
          </Col>
        )}
      </div>

      {/* Footer */}
      <Row className="border-ink-200 items-center border-t px-5 py-1.5 gap-3">
        <TradesButton contract={contract} size="sm" />
        {liquidity > 0 && (
          <Row className="text-ink-500 items-center gap-1">
            <TbDroplet className="h-4 w-4 stroke-2" />
            <span className="text-ink-600 text-[13px]">
              {shortFormatNumber(liquidity)}
            </span>
          </Row>
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
        <Link
          href={contractUrl}
          className="text-ink-400 hover:text-ink-600 ml-auto text-[11px] transition-colors"
        >
          View market →
        </Link>
      </Row>
    </div>
  )
}
