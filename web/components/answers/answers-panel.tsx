import {
  ArrowRightIcon,
  ChevronDownIcon,
  PencilIcon,
  PresentationChartLineIcon,
  ScaleIcon,
} from '@heroicons/react/outline'
import { groupBy, sumBy } from 'lodash'
import clsx from 'clsx'
import {
  sortAnswers,
  type Answer,
  type DpmAnswer,
  type MultiSort,
  OTHER_TOOLTIP_TEXT,
} from 'common/answer'
import { Bet, LimitBet } from 'common/bet'
import { getAnswerProbability } from 'common/calculate'
import { MultiContract, contractPath, Contract, SORTS } from 'common/contract'
import Link from 'next/link'
import { Button, IconButton, buttonClass } from 'web/components/buttons/button'
import { Row } from 'web/components/layout/row'
import { useUser } from 'web/hooks/use-user'
import { useUserContractBets } from 'web/hooks/use-user-bets'
import { useDisplayUserByIdOrAnswer } from 'web/hooks/use-user-supabase'
import { getAnswerColor, useChartAnswers } from '../charts/contract/choice'
import { Col } from '../layout/col'
import {
  AddComment,
  AnswerBar,
  CreatorAndAnswerLabel,
  AnswerStatus,
  BetButtons,
  AnswerPosition,
} from './answer-components'
import { floatingEqual } from 'common/util/math'
import { InfoTooltip } from '../widgets/info-tooltip'
import DropdownMenu from '../comments/dropdown-menu'
import generateFilterDropdownItems from '../search/search-dropdown-helpers'
import { SearchCreateAnswerPanel } from './create-answer-panel'
import { useEffect, useMemo, useState } from 'react'
import { editAnswerCpmm, updateMarket } from 'web/lib/firebase/api'
import { Modal } from 'web/components/layout/modal'
import { Title } from 'web/components/widgets/title'
import { Input } from 'web/components/widgets/input'
import { isAdminId, isModId } from 'common/envs/constants'
import { User } from 'common/user'
import { Avatar } from 'web/components/widgets/avatar'
import { UserLink } from 'web/components/widgets/user-link'
import { TradesButton } from 'web/components/contract/trades-button'
import toast from 'react-hot-toast'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { OrderBookButton } from '../bet/order-book'
import { useUnfilledBets } from 'web/hooks/use-bets'
import { Tooltip } from '../widgets/tooltip'
import { formatMoney, shortFormatNumber } from 'common/util/format'
import { useIsClient } from 'web/hooks/use-is-client'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { useIsAdvancedTrader } from 'web/hooks/use-is-advanced-trader'
import { CustomizeableDropdown } from '../widgets/customizeable-dropdown'
import { CirclePicker } from 'react-color'
import { UserHovercard } from '../user/user-hovercard'
import { searchInAny } from 'common/util/parse'

const SHOW_LIMIT_ORDER_CHARTS_KEY = 'SHOW_LIMIT_ORDER_CHARTS_KEY'
const MAX_DEFAULT_ANSWERS = 20
const MAX_DEFAULT_GRAPHED_ANSWERS = 6

// full resorting, hover, clickiness, search and add
export function AnswersPanel(props: {
  contract: MultiContract
  selectedAnswerIds: string[]
  sort: MultiSort
  setSort: (sort: MultiSort) => void
  query: string
  setQuery: (query: string) => void
  onAnswerCommentClick?: (answer: Answer | DpmAnswer) => void
  onAnswerHover: (answer: Answer | DpmAnswer | undefined) => void
  onAnswerClick: (answer: Answer | DpmAnswer) => void
  showSetDefaultSort?: boolean
  setDefaultAnswerIdsToGraph?: (ids: string[]) => void
}) {
  const {
    contract,
    onAnswerCommentClick,
    onAnswerHover,
    onAnswerClick,
    selectedAnswerIds,
    sort,
    setSort,
    query,
    setQuery,
    showSetDefaultSort,
    setDefaultAnswerIdsToGraph,
  } = props
  const { outcomeType, resolutions } = contract
  const addAnswersMode =
    'addAnswersMode' in contract
      ? contract.addAnswersMode
      : outcomeType === 'FREE_RESPONSE'
      ? 'ANYONE'
      : 'DISABLED'
  const shouldAnswersSumToOne =
    'shouldAnswersSumToOne' in contract ? contract.shouldAnswersSumToOne : true

  const isMultipleChoice = outcomeType === 'MULTIPLE_CHOICE'

  const answers = contract.answers
    .filter((a) => isMultipleChoice || ('number' in a && a.number !== 0))
    .map((a) => ({
      ...a,
      prob: getAnswerProbability(contract, a.id),
    }))
  const [showAll, setShowAll] = useState(
    (addAnswersMode === 'DISABLED' && answers.length <= 10) ||
      answers.length <= 5
  )
  const sortedAnswers = useMemo(
    () => sortAnswers(contract, answers, sort),
    [answers, resolutions, shouldAnswersSumToOne, sort]
  )
  const searchedAnswers = useMemo(() => {
    if (!answers.length || !query) return []

    return sortedAnswers.filter(
      (answer) =>
        selectedAnswerIds.includes(answer.id) || searchInAny(query, answer.text)
    )
  }, [sortedAnswers, query])

  const allResolved =
    (shouldAnswersSumToOne && !!contract.resolutions) ||
    answers.every((a) => 'resolution' in a)

  const answersToShow = query
    ? searchedAnswers
    : showAll
    ? sortedAnswers
    : sortedAnswers
        .filter((answer) => {
          if (selectedAnswerIds.includes(answer.id)) {
            return true
          }

          if (allResolved) return true
          if (sort === 'prob-asc') {
            return answer.prob < 0.99
          } else if (sort === 'prob-desc') {
            return answer.prob > 0.01
          } else if (sort === 'liquidity' || sort === 'new' || sort === 'old') {
            return !('resolution' in answer)
          }
          return true
        })
        .slice(0, MAX_DEFAULT_ANSWERS)
  useEffect(() => {
    if (!selectedAnswerIds.length)
      setDefaultAnswerIdsToGraph?.(
        answersToShow.map((a) => a.id).slice(0, MAX_DEFAULT_GRAPHED_ANSWERS)
      )
  }, [selectedAnswerIds.length, answersToShow.length])

  const showAvatars =
    addAnswersMode === 'ANYONE' ||
    answers.some((a) => a.userId !== contract.creatorId)

  const user = useUser()

  const answersArray = useChartAnswers(contract).map((answer) => answer.text)

  const userBets = useUserContractBets(user?.id, contract.id)
  const userBetsByAnswer = groupBy(userBets, (bet) => bet.answerId)
  const unfilledBets = useUnfilledBets(contract.id)

  const isAdvancedTrader = useIsAdvancedTrader()
  const [shouldShowLimitOrderChart, setShouldShowLimitOrderChart] =
    usePersistentLocalState<boolean>(true, SHOW_LIMIT_ORDER_CHARTS_KEY)

  const moreCount = answers.length - answersToShow.length
  // Note: Hide answers if there is just one "Other" answer.
  const showNoAnswers =
    answers.length === 0 || (shouldAnswersSumToOne && answers.length === 1)
  const [expandedIds, setExpandedIds] = useState<string[]>([])
  const setDefaultSort = async () => {
    await toast.promise(updateMarket({ contractId: contract.id, sort }), {
      loading: 'Updating sort order...',
      success: 'Sort order updated for all users',
      error: 'Failed to update sort order',
    })
  }
  return (
    <Col>
      <SearchCreateAnswerPanel
        contract={contract}
        addAnswersMode={addAnswersMode}
        text={query}
        setText={setQuery}
      >
        <Row className={'mb-1 items-center gap-4'}>
          <DropdownMenu
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
          {showSetDefaultSort && contract.sort !== sort && (
            <Button color="gray-outline" size="2xs" onClick={setDefaultSort}>
              Set default
            </Button>
          )}

          {isAdvancedTrader && (
            <Row className="items-center gap-2">
              <input
                id="limitOrderChart"
                type="checkbox"
                className="border-ink-500 bg-canvas-0 dark:border-ink-500 text-ink-500 focus:ring-ink-500 h-4 w-4 rounded"
                checked={shouldShowLimitOrderChart}
                onChange={() =>
                  setShouldShowLimitOrderChart(!shouldShowLimitOrderChart)
                }
              />
              <label
                htmlFor="limitOrderChart"
                className="text-ink-500 text-sm font-medium"
              >
                Show limit orders
              </label>
            </Row>
          )}
        </Row>
      </SearchCreateAnswerPanel>

      {showNoAnswers ? (
        <div className="text-ink-500 p-4 text-center">No answers yet</div>
      ) : (
        <Col className="mx-[2px] mt-1 gap-2">
          {answersToShow.map((answer) => (
            <Answer
              key={answer.id}
              user={user}
              answer={answer}
              contract={contract}
              onCommentClick={
                onAnswerCommentClick
                  ? () => onAnswerCommentClick(answer)
                  : undefined
              }
              onHover={(hovering) =>
                onAnswerHover?.(hovering ? answer : undefined)
              }
              onClick={() => {
                onAnswerClick?.(answer)
                if (!('poolYes' in answer) || !user) return
                setExpandedIds((ids) =>
                  ids.includes(answer.id)
                    ? ids.filter((id) => id !== answer.id)
                    : [...ids, answer.id]
                )
              }}
              unfilledBets={unfilledBets?.filter(
                (b) => b.answerId === answer.id
              )}
              selected={selectedAnswerIds?.includes(answer.id)}
              color={getAnswerColor(answer, answersArray)}
              userBets={userBetsByAnswer[answer.id]}
              showAvatars={showAvatars}
              expanded={expandedIds.includes(answer.id)}
              shouldShowLimitOrderChart={
                isAdvancedTrader && shouldShowLimitOrderChart
              }
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

export const EditAnswerModal = (props: {
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
  barColor?: string
}) {
  const { contract, maxAnswers = Infinity, barColor } = props
  const { outcomeType } = contract

  const shouldAnswersSumToOne =
    'shouldAnswersSumToOne' in contract ? contract.shouldAnswersSumToOne : true
  const user = useUser()
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

  const displayedAnswers = sortAnswers(contract, answers).slice(0, maxAnswers)

  const moreCount = answers.length - displayedAnswers.length

  const answersArray = useChartAnswers(contract).map((answer) => answer.text)
  const unfilledBets = useUnfilledBets(contract.id)

  // Note: Hide answers if there is just one "Other" answer.
  const showNoAnswers =
    answers.length === 0 || (shouldAnswersSumToOne && answers.length === 1)
  const isAdvancedTrader = useIsAdvancedTrader()
  const [shouldShowLimitOrderChart] = usePersistentLocalState<boolean>(
    true,
    SHOW_LIMIT_ORDER_CHARTS_KEY
  )

  return (
    <Col className="mx-[2px] gap-2">
      {showNoAnswers ? (
        <div className="text-ink-500 pb-4">No answers yet</div>
      ) : (
        <>
          {displayedAnswers.map((answer) => (
            <Answer
              user={user}
              key={answer.id}
              answer={answer}
              contract={contract}
              color={getAnswerColor(answer, answersArray)}
              showAvatars={showAvatars}
              barColor={barColor}
              shouldShowLimitOrderChart={
                isAdvancedTrader && shouldShowLimitOrderChart
              }
              unfilledBets={unfilledBets?.filter(
                (b) => b.answerId === answer.id
              )}
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

export function Answer(props: {
  contract: MultiContract
  answer: Answer | DpmAnswer
  unfilledBets?: Array<LimitBet>
  color: string
  user: User | undefined | null
  onCommentClick?: () => void
  onHover?: (hovering: boolean) => void
  onClick?: () => void
  selected?: boolean
  userBets?: Bet[]
  showAvatars?: boolean
  expanded?: boolean
  barColor?: string
  shouldShowLimitOrderChart: boolean
}) {
  const {
    answer,
    contract,
    unfilledBets,
    onCommentClick,
    onHover,
    onClick,
    selected,
    color,
    userBets,
    showAvatars,
    expanded,
    user,
    barColor,
    shouldShowLimitOrderChart,
  } = props

  // TODO: we don't need to load the answer creator if we're not showing avatars
  const answerCreator = useDisplayUserByIdOrAnswer(answer)
  const prob = getAnswerProbability(contract, answer.id)
  const [editAnswer, setEditAnswer] = useState<Answer>()

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
  const isMobile = useIsMobile()
  const isClient = useIsClient()

  const limitOrderVolume = useMemo(
    () => sumBy(unfilledBets, (bet) => bet.orderAmount - bet.amount),
    [unfilledBets]
  )

  const textColorClass = resolvedProb === 0 ? 'text-ink-700' : 'text-ink-900'
  return (
    <Col className={'w-full'}>
      <AnswerBar
        color={color}
        prob={prob}
        resolvedProb={resolvedProb}
        onHover={onHover}
        onClick={onClick}
        className={clsx(
          'cursor-pointer',
          selected && 'ring-primary-600 rounded  ring-2'
        )}
        barColor={barColor}
        label={
          <Row className={'items-center gap-1'}>
            <AnswerStatus contract={contract} answer={answer} />
            {isOther ? (
              <span className={textColorClass}>
                Other{' '}
                <InfoTooltip
                  className="!text-ink-600 dark:!text-ink-700"
                  text={OTHER_TOOLTIP_TEXT}
                />
              </span>
            ) : (
              <CreatorAndAnswerLabel
                text={answer.text}
                createdTime={answer.createdTime}
                className={clsx(
                  'items-center text-sm !leading-none sm:text-base',
                  textColorClass
                )}
              />
            )}
          </Row>
        }
        end={
          <Row className={'items-center gap-1.5 sm:gap-2'}>
            {selected && (
              <PresentationChartLineIcon
                className="h-5 w-5 text-black"
                style={{ fill: color }}
              />
            )}
            <BetButtons
              contract={contract}
              answer={answer}
              fillColor={barColor}
            />
            {onClick && (
              <IconButton
                className={'-ml-1 !px-1.5'}
                size={'2xs'}
                onClick={(e) => {
                  e.stopPropagation()
                  onClick()
                }}
              >
                <ChevronDownIcon
                  className={clsx(
                    'h-4 w-4',
                    expanded ? 'rotate-180 transform' : 'rotate-0 transform'
                  )}
                />
              </IconButton>
            )}
          </Row>
        }
        renderBackgroundLayer={
          shouldShowLimitOrderChart &&
          isClient && (
            <LimitOrderBarChart
              limitOrders={unfilledBets}
              prob={prob}
              activeColor={color}
            />
          )
        }
      />
      {!resolution && hasBets && isCpmm && user && (
        <AnswerPosition
          contract={contract}
          answer={answer as Answer}
          userBets={userBets}
          className="mt-0.5 self-end sm:mx-3 sm:mt-0"
          user={user}
        />
      )}

      {expanded && (
        <Row className={'mx-0.5 mb-1 mt-2 items-center'}>
          {showAvatars && answerCreator && (
            <UserHovercard userId={answerCreator.id}>
              <Row className={'items-center self-start'}>
                <Avatar avatarUrl={answerCreator.avatarUrl} size={'xs'} />
                <UserLink
                  user={answerCreator}
                  noLink={false}
                  className="ml-1 text-sm"
                  short={isMobile}
                />
              </Row>
            </UserHovercard>
          )}
          <Row className={'w-full justify-end gap-2'}>
            {user &&
              'isOther' in answer &&
              !answer.isOther &&
              (isAdminId(user.id) ||
                isModId(user.id) ||
                user.id === contract.creatorId ||
                user.id === answer.userId) && (
                <CustomizeableDropdown
                  menuWidth="200px"
                  buttonClass={clsx(
                    buttonClass('2xs', 'gray-outline'),
                    'h-full'
                  )}
                  buttonContent={() => (
                    <div
                      className="h-4 w-4 rounded-full"
                      style={{ background: color }}
                    />
                  )}
                  dropdownMenuContent={(close) => (
                    <CirclePicker
                      className="w-[240px] py-2"
                      onChange={async (change) => {
                        try {
                          await editAnswerCpmm({
                            answerId: answer.id,
                            contractId: contract.id,
                            color: change.hex,
                          })
                        } catch (error) {
                          console.error(error)
                        } finally {
                          close()
                        }
                      }}
                    />
                  )}
                />
              )}

            {user &&
              'isOther' in answer &&
              !answer.isOther &&
              (isAdminId(user.id) ||
                isModId(user.id) ||
                user.id === contract.creatorId ||
                user.id === answer.userId) && (
                <Button
                  color={'gray-outline'}
                  size="2xs"
                  onClick={() =>
                    'poolYes' in answer && !answer.isOther
                      ? setEditAnswer(answer)
                      : null
                  }
                >
                  <PencilIcon className="mr-1 h-4 w-4" />
                  Edit
                </Button>
              )}

            {unfilledBets?.length && limitOrderVolume ? (
              <OrderBookButton
                limitBets={unfilledBets}
                contract={contract}
                label={
                  <Tooltip
                    text={`Limit order volume: ${formatMoney(
                      limitOrderVolume
                    )}`}
                    placement="top"
                    noTap
                    className="flex flex-row gap-1"
                  >
                    <ScaleIcon className="h-5 w-5" />
                    {shortFormatNumber(limitOrderVolume)}
                  </Tooltip>
                }
                buttonColor="gray-outline"
              />
            ) : null}
            {'poolYes' in answer && (
              <TradesButton
                contract={contract}
                answer={answer}
                color={'gray-outline'}
              />
            )}
            {onCommentClick && <AddComment onClick={onCommentClick} />}
          </Row>
        </Row>
      )}
      {editAnswer && (
        <EditAnswerModal
          open={!!editAnswer}
          setOpen={() => setEditAnswer(undefined)}
          contract={contract}
          answer={editAnswer}
        />
      )}
    </Col>
  )
}

export function LimitOrderBarChart({
  limitOrders,
  prob,
  activeColor,
}: {
  limitOrders?: Array<LimitBet>
  prob: number
  activeColor: string
}) {
  const limitOrdersByProb = useMemo(
    () => groupBy(limitOrders, 'limitProb'),
    [limitOrders]
  )

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {Object.entries(limitOrdersByProb).map(([limitProb, bets]) => {
        const numericLimitProb = Number(limitProb)
        const volume = sumBy(bets, (bet) => bet.orderAmount - bet.amount)

        const logVolume = Math.log(volume)
        const logMaxOfVolume = Math.log(40000)
        const scaledResult = (logVolume / logMaxOfVolume) * 50 // Only fill up max 50% of the height

        return (
          <div
            key={limitProb}
            className={clsx(
              'absolute bottom-0 -ml-1 min-h-[3px] w-0.5 rounded-t dark:brightness-75'
            )}
            style={{
              left: `${numericLimitProb * 100}%`,
              height: `${scaledResult}%`,

              backgroundColor:
                prob >= numericLimitProb
                  ? 'rgb(var(--color-canvas-50))'
                  : activeColor,
            }}
          ></div>
        )
      })}
    </div>
  )
}
