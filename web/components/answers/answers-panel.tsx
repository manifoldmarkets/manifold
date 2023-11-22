import {
  ArrowRightIcon,
  ChevronDownIcon,
  PencilIcon,
  PresentationChartLineIcon,
} from '@heroicons/react/outline'
import { groupBy, sortBy, sumBy } from 'lodash'
import clsx from 'clsx'
import { Answer, DpmAnswer } from 'common/answer'
import { Bet } from 'common/bet'
import { getAnswerProbability, getContractBetMetrics } from 'common/calculate'
import {
  CPMMMultiContract,
  MultiContract,
  contractPath,
  Contract,
} from 'common/contract'
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
import { MultiSort } from '../contract/contract-overview'
import { useState } from 'react'
import { editAnswerCpmm } from 'web/lib/firebase/api'
import { Modal } from 'web/components/layout/modal'
import { Title } from 'web/components/widgets/title'
import { Input } from 'web/components/widgets/input'
import { isAdminId, isModId } from 'common/envs/constants'

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
  answersToShow: (Answer | DpmAnswer)[]
  selected: string[]
  sort: MultiSort
  setSort: (sort: MultiSort) => void
  query: string
  setQuery: (query: string) => void
  setShowAll: (showAll: boolean) => void
  onAnswerCommentClick: (answer: Answer | DpmAnswer) => void
  onAnswerHover: (answer: Answer | DpmAnswer | undefined) => void
  onAnswerClick: (answer: Answer | DpmAnswer) => void
}) {
  const {
    contract,
    onAnswerCommentClick,
    onAnswerHover,
    onAnswerClick,
    answersToShow,
    selected,
    sort,
    setSort,
    query,
    setQuery,
    setShowAll,
  } = props
  const { outcomeType, answers } = contract
  const addAnswersMode =
    'addAnswersMode' in contract
      ? contract.addAnswersMode
      : outcomeType === 'FREE_RESPONSE'
      ? 'ANYONE'
      : 'DISABLED'
  const showAvatars =
    addAnswersMode === 'ANYONE' ||
    answers.some((a) => a.userId !== contract.creatorId)

  const shouldAnswersSumToOne =
    'shouldAnswersSumToOne' in contract ? contract.shouldAnswersSumToOne : true

  const user = useUser()

  const answersArray = useChartAnswers(contract).map((answer) => answer.text)

  const userBets = useUserContractBets(user?.id, contract.id)
  const userBetsByAnswer = groupBy(userBets, (bet) => bet.answerId)

  const moreCount = answers.length - answersToShow.length

  // Note: Hide answers if there is just one "Other" answer.
  const showNoAnswers =
    answers.length === 0 || (shouldAnswersSumToOne && answers.length === 1)
  const [expandedIds, setExpandedIds] = useState<string[]>([])
  const [editAnswer, setEditAnswer] = useState<Answer>()
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
            <Col key={answer.id}>
              <Answer
                answer={answer}
                contract={contract}
                onCommentClick={() => onAnswerCommentClick?.(answer)}
                onHover={(hovering) =>
                  onAnswerHover?.(hovering ? answer : undefined)
                }
                onClick={() => {
                  onAnswerClick?.(answer)
                  if (!('poolYes' in answer) || !user) return
                  if (
                    !isAdminId(user.id) &&
                    !isModId(user.id) &&
                    user.id !== contract.creatorId &&
                    user.id !== answer.userId
                  )
                    return
                  setExpandedIds((ids) =>
                    ids.includes(answer.id)
                      ? ids.filter((id) => id !== answer.id)
                      : [...ids, answer.id]
                  )
                }}
                selected={selected?.includes(answer.id)}
                color={getAnswerColor(answer, answersArray)}
                userBets={userBetsByAnswer[answer.id]}
                showAvatars={showAvatars}
              />
              {expandedIds.includes(answer.id) && (
                <Row className={'my-2 justify-end'}>
                  <Button
                    color={'gray-outline'}
                    size="xs"
                    onClick={() =>
                      'poolYes' in answer && !answer.isOther
                        ? setEditAnswer(answer)
                        : null
                    }
                  >
                    <PencilIcon className="mr-1 h-4 w-4" />
                    Edit
                  </Button>
                </Row>
              )}
            </Col>
          ))}
          {editAnswer && (
            <EditAnswerModal
              open={!!editAnswer}
              setOpen={() => setEditAnswer(undefined)}
              contract={contract}
              answer={editAnswer}
            />
          )}

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

const EditAnswerModal = (props: {
  open: boolean
  setOpen: (show: boolean) => void
  contract: Contract
  answer: Answer
}) => {
  const { answer, contract, open, setOpen } = props
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [text, setText] = useState(answer.text)
  const [error, setError] = useState<string | null>(null)
  const editAnswer = async () => {
    if (isSubmitting) return
    setIsSubmitting(true)

    const res = await editAnswerCpmm({
      answerId: answer.id,
      contractId: contract.id,
      text,
    })
      .catch((e) => {
        console.error(e)
        setError(e.message)
        return null
      })
      .finally(() => {
        setIsSubmitting(false)
      })
    if (!res) return

    setOpen(false)
  }

  return (
    <Modal open={open} setOpen={setOpen}>
      <Col className={'bg-canvas-50 rounded-md p-4'}>
        <Title>Edit answer</Title>
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full"
        />
        {error ? <span className="text-red-500">{error}</span> : null}

        <Row className={'mt-2 justify-between'}>
          <Button
            color={'gray-outline'}
            disabled={isSubmitting}
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button color={'indigo'} loading={isSubmitting} onClick={editAnswer}>
            Submit
          </Button>
        </Row>
      </Col>
    </Modal>
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
  const addAnswersMode =
    'addAnswersMode' in contract
      ? contract.addAnswersMode
      : outcomeType === 'FREE_RESPONSE'
      ? 'ANYONE'
      : 'DISABLED'
  const showAvatars =
    addAnswersMode === 'ANYONE' ||
    answers.some((a) => a.userId !== contract.creatorId)

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
              showAvatars={showAvatars}
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
  showAvatars?: boolean
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
    showAvatars,
  } = props

  const answerCreator = useUserByIdOrAnswer(answer)
  const prob = getAnswerProbability(contract, answer.id)

  const isCpmm = contract.mechanism === 'cpmm-multi-1'
  const isOther = 'isOther' in answer && answer.isOther

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
              creator={showAvatars ? answerCreator ?? false : undefined}
              className={clsx(
                'items-center text-sm !leading-none sm:text-base',
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
