import {
  ArrowRightIcon,
  ChevronDownIcon,
  PresentationChartLineIcon,
} from '@heroicons/react/outline'
import { groupBy, sortBy, sumBy } from 'lodash'
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { Answer, DpmAnswer } from 'common/answer'
import { Bet } from 'common/bet'
import { getAnswerProbability, getContractBetMetrics } from 'common/calculate'
import { CPMMMultiContract, MultiContract, contractPath } from 'common/contract'
import { formatMoney } from 'common/util/format'
import Link from 'next/link'
import { Button } from 'web/components/buttons/button'
import { Row } from 'web/components/layout/row'
import { useUser } from 'web/hooks/use-user'
import { useUserContractBets } from 'web/hooks/use-user-bets'
import { useUserByIdOrAnswer } from 'web/hooks/use-user-supabase'
import { getAnswerColor, useChartAnswers } from '../charts/contract/choice'
import { Col } from '../layout/col'
import { NoLabel, YesLabel } from '../outcome-label'
import {
  AddComment,
  AnswerBar,
  AnswerLabel,
  AnswerStatusAndBetButtons,
} from './answer-components'
import { floatingEqual } from 'common/util/math'
import { InfoTooltip } from '../widgets/info-tooltip'
import DropdownMenu from '../comments/dropdown-menu'
import generateFilterDropdownItems from '../search/search-dropdown-helpers'
import { SearchCreateAnswerPanel } from './create-answer-panel'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { searchInAny } from 'common/util/parse'

type Sort = 'prob-desc' | 'prob-asc' | 'old' | 'new' | 'liquidity'

const SORTS = [
  { label: 'High %', value: 'prob-desc' },
  { label: 'Low %', value: 'prob-asc' },
  { label: 'Old', value: 'old' },
  { label: 'New', value: 'new' },
  { label: 'Trending', value: 'liquidity' },
] as const

// full resorting, hover, clickiness, search and add
export function AnswersPanel(props: {
  contract: MultiContract
  onAnswerCommentClick: (answer: Answer | DpmAnswer) => void
  onAnswerHover: (answer: Answer | DpmAnswer | undefined) => void
  onAnswerClick: (answer: Answer | DpmAnswer) => void
  selected?: string[] // answer ids
}) {
  const {
    contract,
    onAnswerCommentClick,
    onAnswerHover,
    onAnswerClick,
    selected,
  } = props
  const { resolutions, outcomeType } = contract
  const isMultipleChoice = outcomeType === 'MULTIPLE_CHOICE'
  const addAnswersMode =
    'addAnswersMode' in contract
      ? contract.addAnswersMode
      : outcomeType === 'FREE_RESPONSE'
      ? 'ANYONE'
      : 'DISABLED'
  const shouldAnswersSumToOne =
    'shouldAnswersSumToOne' in contract ? contract.shouldAnswersSumToOne : true

  const [query, setQuery] = usePersistentInMemoryState(
    '',
    'create-answer-text' + contract.id
  )

  const answers = contract.answers
    .filter((a) => isMultipleChoice || ('number' in a && a.number !== 0))
    .map((a) => ({
      ...a,
      prob: getAnswerProbability(contract, a.id),
    }))

  const [sort, setSort] = usePersistentInMemoryState<Sort>(
    addAnswersMode === 'DISABLED'
      ? 'old'
      : !shouldAnswersSumToOne
      ? 'liquidity'
      : answers.length > 10
      ? 'prob-desc'
      : 'old',
    'answer-sort' + contract.id
  )

  const [showAll, setShowAll] = useState(
    addAnswersMode === 'DISABLED' || answers.length <= 5
  )

  const sortedAnswers = useMemo(
    () =>
      sortBy(answers, [
        shouldAnswersSumToOne
          ? // Winners first
            (answer) => (resolutions ? -1 * resolutions[answer.id] : answer)
          : // Resolved last
            (answer) =>
              'resolutionTime' in answer ? answer.resolutionTime ?? 1 : 0,
        // then by sort
        (answer) => {
          if (sort === 'old') {
            return 'index' in answer ? answer.index : answer.number
          } else if (sort === 'new') {
            return 'index' in answer ? -answer.index : -answer.number
          } else if (sort === 'prob-asc') {
            return answer.prob
          } else if (sort === 'prob-desc') {
            return -1 * answer.prob
          } else if (sort === 'liquidity') {
            return 'subsidyPool' in answer ? answer.subsidyPool : 0
          }
        },
      ]),
    [answers, resolutions, shouldAnswersSumToOne, sort]
  )

  const searchedAnswers = useMemo(() => {
    if (!answers.length || !query) return []

    return sortedAnswers.filter(
      (answer) =>
        selected?.includes(answer.id) || searchInAny(query, answer.text)
    )
  }, [sortedAnswers, query])

  const answersToShow = query
    ? searchedAnswers
    : showAll
    ? sortedAnswers
    : sortedAnswers.filter((answer) => {
        if (selected?.includes(answer.id)) {
          return true
        }

        if (resolutions?.[answer.id]) {
          return true
        }
        if (sort === 'prob-asc') {
          return answer.prob < 0.99
        } else if (sort === 'prob-desc') {
          return answer.prob > 0.01
        } else if (sort === 'liquidity' || sort === 'new' || sort === 'old') {
          return !('resolution' in answer)
        }
      })

  const user = useUser()

  const answersArray = useChartAnswers(contract).map((answer) => answer.text)

  const userBets = useUserContractBets(user?.id, contract.id)
  const userBetsByAnswer = groupBy(userBets, (bet) => bet.answerId)

  const moreCount = answers.length - answersToShow.length

  // Note: Hide answers if there is just one "Other" answer.
  const showNoAnswers =
    answers.length === 0 || (shouldAnswersSumToOne && answers.length === 1)

  return (
    <Col>
      <SearchCreateAnswerPanel
        contract={contract}
        addAnswersMode={addAnswersMode}
        text={query}
        setText={setQuery}
      >
        <DropdownMenu
          className="mb-1"
          closeOnClick
          items={generateFilterDropdownItems(SORTS, setSort)}
          icon={
            <Row className="text-ink-500 items-center gap-0.5">
              <span className="whitespace-nowrap text-sm font-medium">
                Sort: {SORTS.find((s) => s.value === sort)?.label}
              </span>
              <ChevronDownIcon className="h-4 w-4" />
            </Row>
          }
        />
      </SearchCreateAnswerPanel>

      {showNoAnswers ? (
        <div className="text-ink-500 p-4 text-center">No answers yet</div>
      ) : (
        <Col className="mx-[2px] mt-1 gap-2">
          {answersToShow.map((answer) => (
            <Answer
              key={answer.id}
              answer={answer}
              contract={contract}
              onCommentClick={() => onAnswerCommentClick?.(answer)}
              onHover={(hovering) =>
                onAnswerHover?.(hovering ? answer : undefined)
              }
              onClick={() => onAnswerClick?.(answer)}
              selected={selected?.includes(answer.id)}
              color={getAnswerColor(answer, answersArray)}
              userBets={userBetsByAnswer[answer.id]}
            />
          ))}

          {moreCount > 0 &&
            (query ? (
              <div className="text-ink-600 pb-4 text-center">
                {moreCount} answers hidden by search
              </div>
            ) : (
              <Button
                color="gray-white"
                onClick={() => setShowAll(true)}
                size="xs"
              >
                <ChevronDownIcon className="mr-1 h-4 w-4" />
                Show {moreCount} more {moreCount === 1 ? 'answer' : 'answers'}
              </Button>
            ))}
        </Col>
      )}
    </Col>
  )
}

// just the bars
export function SimpleAnswerBars(props: {
  contract: MultiContract
  maxAnswers?: number
}) {
  const { contract, maxAnswers = Infinity } = props
  const { resolutions, outcomeType } = contract

  const shouldAnswersSumToOne =
    'shouldAnswersSumToOne' in contract ? contract.shouldAnswersSumToOne : true

  const answers = contract.answers
    .filter(
      (a) =>
        outcomeType === 'MULTIPLE_CHOICE' || ('number' in a && a.number !== 0)
    )
    .map((a) => ({ ...a, prob: getAnswerProbability(contract, a.id) }))

  const sortByProb = answers.length > maxAnswers
  const displayedAnswers = sortBy(answers, [
    // Winners for shouldAnswersSumToOne
    (answer) => (resolutions ? -1 * resolutions[answer.id] : answer),
    // Winners for independent binary
    (answer) =>
      'resolution' in answer && answer.resolution
        ? -answer.subsidyPool
        : -Infinity,
    // then by prob or index
    (answer) =>
      !sortByProb && 'index' in answer ? answer.index : -1 * answer.prob,
  ]).slice(0, maxAnswers)

  const moreCount = answers.length - displayedAnswers.length

  const answersArray = useChartAnswers(contract).map((answer) => answer.text)

  // Note: Hide answers if there is just one "Other" answer.
  const showNoAnswers =
    answers.length === 0 || (shouldAnswersSumToOne && answers.length === 1)

  return (
    <Col className="mx-[2px] gap-2">
      {showNoAnswers ? (
        <div className="text-ink-500 pb-4">No answers yet</div>
      ) : (
        <>
          {displayedAnswers.map((answer) => (
            <Answer
              key={answer.id}
              answer={answer}
              contract={contract}
              color={getAnswerColor(answer, answersArray)}
            />
          ))}
          {moreCount > 0 && (
            <Row className="w-full justify-end">
              <Link
                className="text-ink-500 hover:text-primary-500 text-sm"
                href={contractPath(contract)}
              >
                See {moreCount} more {moreCount === 1 ? 'answer' : 'answers'}{' '}
                <ArrowRightIcon className="inline h-4 w-4" />
              </Link>
            </Row>
          )}
        </>
      )}
    </Col>
  )
}

function Answer(props: {
  contract: MultiContract
  answer: Answer | DpmAnswer
  color: string
  onCommentClick?: () => void
  onHover?: (hovering: boolean) => void
  onClick?: () => void
  selected?: boolean
  userBets?: Bet[]
}) {
  const {
    answer,
    contract,
    onCommentClick,
    onHover,
    onClick,
    selected,
    color,
    userBets,
  } = props

  const answerCreator = useUserByIdOrAnswer(answer)
  const prob = getAnswerProbability(contract, answer.id)

  const isCpmm = contract.mechanism === 'cpmm-multi-1'
  const isFreeResponse = contract.outcomeType === 'FREE_RESPONSE'
  const isOther = 'isOther' in answer && answer.isOther
  const addAnswersMode =
    'addAnswersMode' in contract
      ? contract.addAnswersMode ?? 'DISABLED'
      : isFreeResponse
      ? 'ANYONE'
      : 'DISABLED'

  const { resolution, resolutions } = contract
  const resolvedProb =
    resolution == undefined
      ? undefined
      : resolution === answer.id
      ? 1
      : (resolutions?.[answer.id] ?? 0) / 100

  const sharesSum = sumBy(userBets, (bet) =>
    bet.outcome === 'YES' ? bet.shares : -bet.shares
  )
  const hasBets = userBets && !floatingEqual(sharesSum, 0)

  const textColorClass = resolvedProb === 0 ? 'text-ink-700' : 'text-ink-900'

  return (
    <Col>
      <AnswerBar
        color={color}
        prob={prob}
        resolvedProb={resolvedProb}
        onHover={onHover}
        onClick={onClick}
        className={clsx(
          'cursor-pointer',
          selected && 'ring-primary-600 rounded ring-2'
        )}
        label={
          isOther ? (
            <span className={textColorClass}>
              Other{' '}
              <InfoTooltip
                className="!text-ink-600 dark:!text-ink-700"
                text="Represents all answers not listed. New answers are split out of this answer."
              />
            </span>
          ) : (
            <AnswerLabel
              text={answer.text}
              createdTime={answer.createdTime}
              creator={
                addAnswersMode === 'ANYONE' ? answerCreator ?? false : undefined
              }
              className={clsx(
                'items-center text-sm !leading-none sm:flex sm:text-base',
                textColorClass
              )}
            />
          )
        }
        end={
          <>
            {selected && (
              <PresentationChartLineIcon
                className="h-5 w-5 text-black"
                style={{ fill: color }}
              />
            )}
            <AnswerStatusAndBetButtons
              contract={contract}
              answer={answer}
              userBets={userBets ?? []}
            />
            {onCommentClick && <AddComment onClick={onCommentClick} />}
          </>
        }
      />
      {!resolution && hasBets && isCpmm && (
        <AnswerPosition
          contract={contract}
          userBets={userBets}
          className="mt-0.5 self-end sm:mx-3 sm:mt-0"
        />
      )}
    </Col>
  )
}

function AnswerPosition(props: {
  contract: CPMMMultiContract
  userBets: Bet[]
  className?: string
}) {
  const { contract, userBets, className } = props

  const { invested, totalShares } = getContractBetMetrics(contract, userBets)

  const yesWinnings = totalShares.YES ?? 0
  const noWinnings = totalShares.NO ?? 0
  const position = yesWinnings - noWinnings

  return (
    <Row
      className={clsx(
        className,
        'text-ink-500 gap-1.5 whitespace-nowrap text-xs font-semibold'
      )}
    >
      <Row className="gap-1">
        Payout
        {position > 1e-7 ? (
          <>
            <span className="text-ink-700">{formatMoney(position)}</span> on
            <YesLabel />
          </>
        ) : position < -1e-7 ? (
          <>
            <span className="text-ink-700">{formatMoney(-position)}</span> on
            <NoLabel />
          </>
        ) : (
          '——'
        )}
      </Row>
      &middot;
      <Row className="gap-1">
        <div className="text-ink-500">Spent</div>
        <div className="text-ink-700">{formatMoney(invested)}</div>
      </Row>
    </Row>
  )
}
