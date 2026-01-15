import {
  ArrowRightIcon,
  ChatIcon,
  ChevronDownIcon,
  DotsVerticalIcon,
  PencilIcon,
  RefreshIcon,
  ScaleIcon,
} from '@heroicons/react/outline'
import { UserIcon } from '@heroicons/react/solid'
import { useUnfilledBets } from 'client-common/hooks/use-bets'
import clsx from 'clsx'
import {
  Answer,
  MultiSort,
  OTHER_TOOLTIP_TEXT,
  getAllResolved,
  getMaximumAnswers,
  getShouldAnswersSumToOne,
  getSortedAnswers,
  sortAnswers,
} from 'common/answer'
import { LimitBet } from 'common/bet'
import { getAnswerProbability } from 'common/calculate'
import {
  CPMMMultiContract,
  Contract,
  MultiContract,
  contractPath,
  tradingAllowed,
} from 'common/contract'
import { ContractMetric, isSummary } from 'common/contract-metric'
import { isAdminId, isModId } from 'common/envs/constants'
import { User } from 'common/user'
import { buildArray } from 'common/util/array'
import { floatingEqual } from 'common/util/math'
import { searchInAny } from 'common/util/parse'
import { debounce, groupBy, sumBy } from 'lodash'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CirclePicker } from 'react-color'
import toast from 'react-hot-toast'
import { Button, buttonClass } from 'web/components/buttons/button'
import {
  TradesModal,
  TradesNumber,
} from 'web/components/contract/trades-button'
import {
  MODAL_CLASS,
  Modal,
  SCROLLABLE_MODAL_CLASS,
} from 'web/components/layout/modal'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/widgets/avatar'
import { Input } from 'web/components/widgets/input'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { useIsAdvancedTrader } from 'web/hooks/use-is-advanced-trader'
import { useIsClient } from 'web/hooks/use-is-client'
import { useIsPageVisible } from 'web/hooks/use-page-visible'
import { useAllSavedContractMetrics } from 'web/hooks/use-saved-contract-metrics'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { useDisplayUserByIdOrAnswer } from 'web/hooks/use-user-supabase'
import { api, editAnswerCpmm, updateMarket } from 'web/lib/api/api'
import {
  OrderBookPanel,
  YourOrders,
  getOrderBookButtonLabel,
} from '../bet/order-book'
import { getAnswerColor } from '../charts/contract/choice'
import { Col } from '../layout/col'
import { RelativeTimestamp } from '../relative-timestamp'
import { UserHovercard } from '../user/user-hovercard'
import { CustomizeableDropdown } from '../widgets/customizeable-dropdown'
import DropdownMenu from '../widgets/dropdown-menu'
import { InfoTooltip } from '../widgets/info-tooltip'
import { Tooltip } from '../widgets/tooltip'
import {
  AnswerBar,
  AnswerPosition,
  AnswerStatus,
  BetButtons,
  CreatorAndAnswerLabel,
} from './answer-components'
import { SearchCreateAnswerPanel } from './create-answer-panel'

const MAX_DEFAULT_GRAPHED_ANSWERS = 6

// the offset in which the top of answers is visible
const SCROLL_OFFSET = 100
// debounce when typing a query to ensure smoother autoscrolling
const DEBOUNCE_DELAY = 100

// full resorting, hover, clickiness, search and add
export function AnswersPanel(props: {
  contract: MultiContract
  selectedAnswerIds: string[]
  sort: MultiSort
  setSort: (sort: MultiSort) => void
  query: string
  setQuery: (query: string) => void
  onAnswerCommentClick?: (answer: Answer) => void
  onAnswerHover?: (answer: Answer | undefined) => void
  onAnswerClick?: (answer: Answer) => void
  showSetDefaultSort?: boolean
  setDefaultAnswerIdsToGraph?: (ids: string[]) => void
  defaultAddAnswer?: boolean
  floatingSearchClassName?: string
  className?: string
  hideSearch?: boolean
  showAll?: boolean
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
    floatingSearchClassName,
    className,
    hideSearch,
  } = props
  const { resolutions } = contract
  const addAnswersMode =
    'addAnswersMode' in contract ? contract.addAnswersMode : 'DISABLED'

  const answers = contract.answers.map((a) => ({
    ...a,
    prob: getAnswerProbability(contract, a.id),
  }))
  const [showAll, setShowAll] = useState(props.showAll)

  const shouldAnswersSumToOne = getShouldAnswersSumToOne(contract)

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

  const answersToShow = query
    ? searchedAnswers
    : showAll
    ? sortedAnswers
    : getSortedAnswers(contract, sortedAnswers, sort, selectedAnswerIds)

  useEffect(() => {
    if (!selectedAnswerIds.length)
      setDefaultAnswerIdsToGraph?.(
        answersToShow.map((a) => a.id).slice(0, MAX_DEFAULT_GRAPHED_ANSWERS)
      )
  }, [selectedAnswerIds.length, answersToShow.length])

  const user = useUser()
  const allMetrics = useAllSavedContractMetrics(contract)
  const metrics = allMetrics?.find((m) => isSummary(m)) ?? {
    invested: 0,
  }

  const isAdvancedTrader = useIsAdvancedTrader()

  const unfilledBets = useUnfilledBets(
    contract.id,
    (params) => api('bets', params),
    useIsPageVisible,
    {
      enabled: isAdvancedTrader,
    }
  )

  const allResolved = getAllResolved(contract, answers)

  const [shouldShowPositions, setShouldShowPositions] = useState(!allResolved)

  const moreCount = answers.length - answersToShow.length
  // Note: Hide answers if there is just one "Other" answer.
  const showNoAnswers =
    answers.length === 0 || (shouldAnswersSumToOne && answers.length === 1)
  const setDefaultSort = async () => {
    await toast.promise(updateMarket({ contractId: contract.id, sort }), {
      loading: 'Updating sort order...',
      success: 'Sort order updated for all users',
      error: 'Failed to update sort order',
    })
  }

  const privateUser = usePrivateUser()
  const unresolvedAnswers = answers.filter((a) => !a.resolution)
  const canAddAnswer = Boolean(
    user &&
      !user.isBannedFromPosting &&
      (addAnswersMode === 'ANYONE' ||
        (addAnswersMode === 'ONLY_CREATOR' &&
          user.id === contract.creatorId)) &&
      tradingAllowed(contract) &&
      !privateUser?.blockedByUserIds.includes(contract.creatorId) &&
      unresolvedAnswers.length < getMaximumAnswers(shouldAnswersSumToOne)
  )

  const answersContainerRef = useRef<HTMLDivElement>(null)
  const previousQueryRef = useRef(query)

  const scrollToAnswers = useCallback(
    debounce(() => {
      if (answersContainerRef.current) {
        const rect = answersContainerRef.current.getBoundingClientRect()
        if (rect.top < SCROLL_OFFSET) {
          window.scrollTo({
            top: window.scrollY + rect.top - SCROLL_OFFSET,
            behavior: 'smooth',
          })
        }
      }
    }, DEBOUNCE_DELAY),
    []
  )

  useEffect(() => {
    if (query === '' && previousQueryRef.current === '') {
      // Don't scroll if the query is empty and there was no previous query
      return
    }
    scrollToAnswers()
    previousQueryRef.current = query
  }, [query, scrollToAnswers])

  return (
    <Col className={className}>
      {!hideSearch && (
        <SearchCreateAnswerPanel
          contract={contract}
          canAddAnswer={canAddAnswer}
          text={query}
          setText={setQuery}
          className={clsx(
            'bg-canvas-0 sticky z-10',
            floatingSearchClassName ?? 'top-[48px]'
          )}
          sort={sort}
          setSort={setSort}
          showDefaultSort={showSetDefaultSort && contract.sort !== sort}
          setDefaultSort={setDefaultSort}
        />
      )}
      <Col ref={answersContainerRef}>
        {showNoAnswers ? (
          <div className="text-ink-500 p-4 pt-20 text-center">
            No answers yet
          </div>
        ) : (
          <Col className="mx-[2px] mt-1 gap-2">
            {answersToShow.map((answer) => (
              <AnswerComponent
                myMetric={allMetrics?.find((m) => m.answerId === answer.id)}
                shouldShowPositions={shouldShowPositions}
                className={
                  selectedAnswerIds.length &&
                  !selectedAnswerIds.includes(answer.id) &&
                  !!onAnswerClick
                    ? 'opacity-70'
                    : ''
                }
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
                onClick={onAnswerClick}
                unfilledBets={unfilledBets?.filter(
                  (b) => b.answerId === answer.id
                )}
                color={getAnswerColor(answer)}
                shouldShowLimitOrderChart={isAdvancedTrader}
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
      {!floatingEqual(metrics?.invested ?? 0, 0) && (
        <Row className="mt-2 items-center justify-end gap-2">
          <input
            id="positions"
            type="checkbox"
            className="border-ink-500 bg-canvas-0 dark:border-ink-500 text-ink-500 focus:ring-ink-500 h-4 w-4 rounded"
            checked={shouldShowPositions}
            onChange={() => setShouldShowPositions(!shouldShowPositions)}
          />
          <label
            htmlFor="positions"
            className="text-ink-500 text-sm font-medium"
          >
            Show your positions
          </label>
        </Row>
      )}
    </Col>
  )
}

export const EditAnswerModal = (props: {
  open: boolean
  setOpen: (show: boolean) => void
  contract: Contract
  answer: Answer
  color: string
}) => {
  const { answer, color, contract, open, setOpen } = props
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
      <Col className={clsx('bg-canvas-50 gap-2 rounded-md p-4')}>
        <span className={'font-semibold'}>Title</span>
        <Row className={'gap-1'}>
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full"
          />
          <Button
            size={'xs'}
            color={'indigo'}
            loading={isSubmitting}
            onClick={editAnswer}
          >
            Save
          </Button>
        </Row>
        <span className={'font-semibold'}>Color</span>
        <CustomizeableDropdown
          menuWidth="200px"
          buttonClass={clsx(buttonClass('sm', 'gray-outline'), 'h-full')}
          buttonContent={() => (
            <div
              className="h-5 w-5 rounded-full"
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

        {error ? <span className="text-red-500">{error}</span> : null}
      </Col>
    </Modal>
  )
}

export const UnresolveAnswerModal = (props: {
  open: boolean
  setOpen: (show: boolean) => void
  contract: Contract
  answer: Answer
}) => {
  const { answer, contract, open, setOpen } = props
  const [isUnresolving, setIsUnresolving] = useState(false)
  const [unresolveText, setUnresolveText] = useState('')
  const [error, setError] = useState<string | null>(null)

  const unresolveAnswer = async () => {
    if (isUnresolving) return
    setIsUnresolving(true)

    try {
      await api('unresolve', {
        contractId: contract.id,
        answerId: answer.id,
      })
      toast.success('Answer unresolved')
      setIsUnresolving(false)
      setUnresolveText('')
      setOpen(false)
    } catch (e) {
      setIsUnresolving(false)
      setError(e instanceof Error ? e.message : 'Failed to unresolve answer')
    }
  }

  return (
    <Modal open={open} setOpen={setOpen}>
      <Col className={clsx('bg-canvas-50 gap-2 rounded-md p-4')}>
        <span className={'font-semibold'}>Unresolve Answer</span>
        <span className={'text-ink-600 text-sm'}>
          Type "UNRESOLVE" to confirm unresolving this answer.
        </span>
        <Row className={'gap-1'}>
          <Input
            value={unresolveText}
            placeholder={'Type UNRESOLVE to unresolve'}
            onChange={(e) => setUnresolveText(e.target.value)}
            className="w-full"
            disabled={isUnresolving}
          />
          <Button
            size={'xs'}
            color={'red'}
            loading={isUnresolving}
            onClick={unresolveAnswer}
            disabled={unresolveText !== 'UNRESOLVE' || isUnresolving}
          >
            Unresolve
          </Button>
        </Row>
        {error ? <span className="text-red-500">{error}</span> : null}
      </Col>
    </Modal>
  )
}

// just the bars
export function SimpleAnswerBars(props: {
  contract: CPMMMultiContract
  maxAnswers?: number
  barColor?: string
  feedReason?: string
}) {
  const { contract, maxAnswers = Infinity, barColor, feedReason } = props

  const shouldAnswersSumToOne = getShouldAnswersSumToOne(contract)
  const user = useUser()
  const answers = contract.answers.map((a) => ({
    ...a,
    prob: getAnswerProbability(contract, a.id),
  }))

  const displayedAnswers = sortAnswers(contract, answers).slice(0, maxAnswers)

  const moreCount = answers.length - displayedAnswers.length

  // Note: Hide answers if there is just one "Other" answer.
  const showNoAnswers =
    answers.length === 0 || (shouldAnswersSumToOne && answers.length === 1)
  const isAdvancedTrader = useIsAdvancedTrader()

  return (
    <Col className="mx-[2px] gap-2">
      {showNoAnswers ? (
        <div className="text-ink-500 pb-4">No answers yet</div>
      ) : (
        <>
          {displayedAnswers.map((answer) => (
            <AnswerComponent
              user={user}
              key={answer.id}
              answer={answer}
              contract={contract}
              color={getAnswerColor(answer)}
              barColor={barColor}
              shouldShowLimitOrderChart={isAdvancedTrader}
              feedReason={feedReason}
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

export function AnswerComponent(props: {
  contract: MultiContract
  answer: Answer
  unfilledBets?: Array<LimitBet>
  color: string
  user: User | undefined | null
  onCommentClick?: () => void
  onHover?: (hovering: boolean) => void
  onClick?: (answer: Answer) => void
  barColor?: string
  shouldShowLimitOrderChart: boolean
  feedReason?: string
  className?: string
  shouldShowPositions?: boolean
  myMetric?: ContractMetric
}) {
  const {
    answer,
    contract,
    unfilledBets,
    onCommentClick,
    onHover,
    onClick,
    color,
    user,
    barColor,
    feedReason,
    shouldShowLimitOrderChart,
    className,
    shouldShowPositions = true,
    myMetric,
  } = props

  const prob = getAnswerProbability(contract, answer.id)
  const [editingAnswer, setEditingAnswer] = useState<Answer>()
  const [unresolveModalOpen, setUnresolveModalOpen] = useState(false)

  const { resolution, resolutions } = contract
  const resolvedProb =
    resolution == undefined
      ? undefined
      : resolution === answer.id
      ? 1
      : (resolutions?.[answer.id] ?? 0) / 100

  const isClient = useIsClient()

  const yourUnfilledBets = unfilledBets?.filter(
    (bet) => bet.userId === user?.id && !bet.silent
  )
  const canEdit = canEditAnswer(answer, contract, user)

  const textColorClass = clsx(
    resolvedProb === 0 ? 'text-ink-700' : 'text-ink-900'
  )

  const userHasLimitOrders =
    shouldShowLimitOrderChart && (yourUnfilledBets ?? []).length > 0

  const limitOrderVolume = useMemo(
    () => sumBy(unfilledBets, (bet) => bet.orderAmount - bet.amount),
    [unfilledBets]
  )

  const [tradesModalOpen, setTradesModalOpen] = useState(false)
  const [limitBetModalOpen, setLimitBetModalOpen] = useState(false)

  const hasLimitOrders = unfilledBets?.length && limitOrderVolume
  const answerCreator = useDisplayUserByIdOrAnswer(answer)
  const answerCreatorIsNotContractCreator =
    !!answerCreator && answerCreator.username !== contract.creatorUsername

  const dropdownItems = buildArray(
    {
      name: 'author info',
      nonButtonContent: (
        <div className="text-ink-400 select-none whitespace-pre-wrap px-4 py-1 text-xs">
          <span>
            {answerCreatorIsNotContractCreator ? (
              <span>
                <Link
                  className="hover:text-primary-600 hover:underline"
                  href={`/${answerCreator.username}`}
                >
                  {answerCreator.name}
                </Link>
                {' •'}
              </span>
            ) : (
              <span>Created</span>
            )}
            <span>
              <RelativeTimestamp time={answer.createdTime} />
            </span>
          </span>
        </div>
      ),
    },
    canEdit &&
      answer.poolYes != undefined &&
      !answer.isOther && {
        icon: <PencilIcon className=" h-4 w-4" />,
        name: 'Edit',
        onClick: () => setEditingAnswer(answer),
      },

    onCommentClick && {
      icon: <ChatIcon className=" h-4 w-4" />,
      name: 'Comment',
      onClick: onCommentClick,
    },
    {
      icon: <UserIcon className="h-4 w-4" />,
      name: 'Trades',
      buttonContent: (
        <Row>
          See
          <TradesNumber
            className="mx-1"
            contract={contract}
            answer={answer}
            shorten
          />
          traders
        </Row>
      ),
      onClick: () => setTradesModalOpen(true),
    },
    hasLimitOrders && {
      icon: <ScaleIcon className="h-4 w-4" />,
      name: getOrderBookButtonLabel(unfilledBets),
      onClick: () => setLimitBetModalOpen(true),
    },
    user &&
      (isModId(user.id) ||
        isAdminId(user.id) ||
        contract.creatorId === user.id) &&
      answer.resolutionTime && {
        icon: <RefreshIcon className="h-4 w-4" />,
        name: 'Unresolve',
        onClick: () => setUnresolveModalOpen(true),
      }
  )

  return (
    <Col className={'full rounded'}>
      <AnswerBar
        color={color}
        prob={prob}
        resolvedProb={resolvedProb}
        onHover={onHover}
        onClick={() => onClick?.(answer)}
        className={clsx('group', onClick && 'cursor-pointer', className)}
        barColor={barColor}
        label={
          <Row className={'items-center gap-2'}>
            {answerCreatorIsNotContractCreator && (
              <AnswerAvatar answer={answer} />
            )}
            <AnswerStatus contract={contract} answer={answer} />
            {answer.isOther ? (
              <span className={textColorClass}>
                Other{' '}
                <InfoTooltip
                  className="!text-ink-600 dark:!text-ink-700"
                  text={OTHER_TOOLTIP_TEXT}
                  tooltipParams={{ placement: 'bottom' }}
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
          <Row className={'items-center gap-1'}>
            {shouldShowLimitOrderChart && isClient && !!hasLimitOrders && (
              <MiniDepthChart
                limitOrders={unfilledBets}
                prob={prob}
                onClick={() => setLimitBetModalOpen(true)}
                numOrders={unfilledBets?.length}
              />
            )}
            <BetButtons
              contract={contract}
              answer={answer}
              fillColor={barColor}
              feedReason={feedReason}
            />
            <DropdownMenu
              closeOnClick
              buttonContent={
                <DotsVerticalIcon className="h-5 w-5" aria-hidden />
              }
              items={dropdownItems}
              withinOverflowContainer
            />
          </Row>
        }
      />

      <Col>
        <Row
          className={
            'select-none flex-wrap items-center justify-end gap-2 px-3 py-0.5 text-xs'
          }
        >
          <Row className="text-ink-500 gap-1.5">
            {user && shouldShowPositions && myMetric && (
              <AnswerPosition
                contract={contract}
                answer={answer}
                className="self-end"
                user={user}
                addDot={userHasLimitOrders}
                myMetric={myMetric}
              />
            )}
            {userHasLimitOrders && (
              <AnswerOrdersButton
                contract={contract}
                yourUnfilledBets={yourUnfilledBets}
                buttonClassName="hover:text-primary-700 text-primary-600 font-bold hover:underline transition-all"
              />
            )}
          </Row>
        </Row>
      </Col>

      {editingAnswer && user && (
        <EditAnswerModal
          open={!!editingAnswer}
          setOpen={() => setEditingAnswer(undefined)}
          contract={contract}
          answer={editingAnswer}
          color={color}
        />
      )}
      {unresolveModalOpen && (
        <UnresolveAnswerModal
          open={unresolveModalOpen}
          setOpen={setUnresolveModalOpen}
          contract={contract}
          answer={answer}
        />
      )}
      {tradesModalOpen && (
        <TradesModal
          contract={contract}
          modalOpen={tradesModalOpen}
          setModalOpen={setTradesModalOpen}
          answer={answer}
        />
      )}
      {!!hasLimitOrders && (
        <Modal
          open={limitBetModalOpen}
          setOpen={setLimitBetModalOpen}
          size="md"
        >
          <OrderBookPanel
            limitBets={unfilledBets}
            contract={contract}
            answer={answer}
            showTitle
          />
        </Modal>
      )}
    </Col>
  )
}

function AnswerOrdersButton(props: {
  contract: MultiContract
  yourUnfilledBets?: LimitBet[]
  buttonClassName?: string
}) {
  const { contract, yourUnfilledBets, buttonClassName } = props
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className={buttonClassName} onClick={() => setOpen(true)}>
        Your Orders
      </button>
      <Modal open={open} setOpen={setOpen}>
        <Col className={clsx(MODAL_CLASS, SCROLLABLE_MODAL_CLASS)}>
          <YourOrders
            contract={contract}
            bets={yourUnfilledBets ?? []}
            deemphasizedHeader
          />
        </Col>
      </Modal>
    </>
  )
}

export function canEditAnswer(
  answer: Answer,
  contract: MultiContract,
  user?: User | undefined | null
) {
  return (
    user &&
    !answer.isOther &&
    (isAdminId(user.id) ||
      isModId(user.id) ||
      user.id === contract.creatorId ||
      user.id === answer.userId)
  )
}

const AnswerAvatar = (props: { answer: Answer; className?: string }) => {
  const { answer, className } = props
  const answerCreator = useDisplayUserByIdOrAnswer(answer)
  if (!answerCreator) return <LoadingIndicator size={'sm'} />
  return (
    <UserHovercard userId={answerCreator.id}>
      <Row className={clsx('-ml-1 items-center self-start', className)}>
        <Avatar avatarUrl={answerCreator.avatarUrl} size={'2xs'} />
      </Row>
    </UserHovercard>
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

// Mini limit order bar chart for display next to Yes/No buttons
// X-axis: probability (0% to 100%)
// Y-axis: order volume at each price point
export function MiniDepthChart({
  limitOrders,
  prob,
  height = 24,
  width = 40,
  onClick,
  numOrders,
}: {
  limitOrders?: Array<LimitBet>
  prob: number
  height?: number
  width?: number
  onClick?: () => void
  numOrders?: number
}) {
  const { ordersByProb, maxVolume } = useMemo(() => {
    if (!limitOrders || limitOrders.length === 0) {
      return { ordersByProb: [], maxVolume: 0 }
    }

    const filtered = limitOrders.filter(
      (b) => (!b.expiresAt || b.expiresAt > Date.now()) && !b.silent
    )

    // Group by limitProb and calculate volume at each price
    const grouped = groupBy(filtered, 'limitProb')
    const orders = Object.entries(grouped).map(([limitProb, bets]) => {
      const volume = sumBy(bets, (bet) => bet.orderAmount - bet.amount)
      const isYes = bets[0].outcome === 'YES'
      return { prob: Number(limitProb), volume, isYes }
    })

    const max = Math.max(...orders.map((o) => o.volume), 0)
    return { ordersByProb: orders, maxVolume: max }
  }, [limitOrders])

  if (ordersByProb.length === 0) {
    return null
  }

  const xScale = (p: number) => p * width
  const yScale = (v: number) =>
    maxVolume > 0 ? (v / maxVolume) * (height - 2) : 0

  const tooltipText = numOrders
    ? `${numOrders} limit order${numOrders === 1 ? '' : 's'}`
    : undefined

  return (
    <Tooltip text={tooltipText}>
      <svg
        width={width}
        height={height}
        className={clsx('flex-shrink-0', onClick && 'cursor-pointer')}
        viewBox={`0 0 ${width} ${height}`}
        onClick={onClick}
      >
        {/* Border */}
        <rect
          x={0.5}
          y={0.5}
          width={width - 1}
          height={height - 1}
          fill="none"
          stroke="rgb(var(--color-ink-300))"
          strokeWidth={1}
          rx={2}
        />
        {/* Vertical bars for each limit order */}
        {ordersByProb.map((order, i) => {
          const x = xScale(order.prob)
          const barHeight = Math.max(2, yScale(order.volume))
          const color = order.isYes ? 'rgb(16 185 129)' : 'rgb(239 68 68)'
          return (
            <rect
              key={i}
              x={x - 0.5}
              y={height - barHeight}
              width={1}
              height={barHeight}
              fill={color}
            />
          )
        })}
        {/* Current price dashed line */}
        <line
          x1={xScale(prob)}
          y1={0}
          x2={xScale(prob)}
          y2={height}
          stroke="rgb(99 102 241)"
          strokeWidth={1}
          strokeDasharray="2 2"
        />
      </svg>
    </Tooltip>
  )
}
