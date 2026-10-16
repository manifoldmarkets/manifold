import clsx from 'clsx'

import {
  contractPath,
  BinaryContract,
  Contract,
  CPMMMultiContract,
  CPMMNumericContract,
  isBinaryMulti,
  isMultiCpmm,
  getMainBinaryMCAnswer,
} from 'common/contract'
import { Col } from '../layout/col'
import { Modal, MODAL_CLASS } from '../layout/modal'
import { BinaryOutcomes, BuyPanel } from './bet-panel'
import { Answer, getDefaultSort, MultiSort } from 'common/answer'
import Link from 'next/link'
import { linkClass } from 'web/components/widgets/site-link'
import { AnswersPanel } from 'web/components/answers/answers-panel'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { BinaryMultiAnswersPanel } from 'web/components/answers/binary-multi-answers-panel'
import { NumericBetPanel } from 'web/components/answers/numeric-bet-panel'
import { Row } from 'web/components/layout/row'
import { NumberResolutionOrExpectation } from 'web/components/contract/contract-price'
import { SliderColor } from '../widgets/slider'
import { getAnswerProbability, getProbability } from 'common/calculate'
import { formatPercent } from 'common/util/format'
import { showsSideProbability, versusSideProb } from 'common/versus'
import { ComponentProps, ReactNode, useState } from 'react'
import { ArrowLeftIcon } from '@heroicons/react/solid'
import { keyBy, sortBy } from 'lodash'
import { Button } from 'web/components/buttons/button'
import { Input } from 'web/components/widgets/input'
import { MultiBetProps } from 'client-common/lib/bet'
import { getAnswerColor } from '../charts/contract/choice'

export function BetDialog(props: {
  contract: BinaryContract
  open: boolean
  setOpen: (open: boolean) => void
  trackingLocation: string
  initialOutcome?: BinaryOutcomes
  binaryPseudonym?: {
    YES: {
      pseudonymName: string
      pseudonymColor: SliderColor
    }
    NO: {
      pseudonymName: string
      pseudonymColor: SliderColor
    }
  }
  questionPseudonym?: string
}) {
  const {
    contract,
    open,
    setOpen,
    trackingLocation,
    initialOutcome,
    questionPseudonym,
  } = props
  const { question } = contract
  const pseudonym = props.binaryPseudonym ?? {
    YES: { pseudonymName: 'YES', pseudonymColor: 'green' as const },
    NO: { pseudonymName: 'NO', pseudonymColor: 'red' as const },
  }

  const initialProb = getProbability(contract)
  // Named sides (e.g. Republican/Democratic) show the chosen side's chance;
  // plain YES/NO shows the YES chance, which buying NO moves down.
  const sideProb = showsSideProbability(contract, pseudonym)
  return (
    <Modal
      open={open}
      setOpen={setOpen}
      ariaLabel={`Bet on ${questionPseudonym ?? question}`}
      className={clsx(MODAL_CLASS, '!px-0 !py-0')}
    >
      <Col className="max-h-[42rem] overflow-auto px-4 py-4">
        <BuyPanel
          contract={contract}
          onBuySuccess={() => setTimeout(() => setOpen(false), 500)}
          location={trackingLocation}
          inModal={true}
          initialOutcome={initialOutcome ?? 'YES'}
          alwaysShowOutcomeSwitcher
          pseudonym={pseudonym}
          className="!px-0"
        >
          {(selectedOutcome) => (
            <Col className="mb-4 gap-2">
              <Link
                className="!text-xl hover:underline"
                href={contractPath(contract)}
              >
                {questionPseudonym ?? question}
              </Link>
              <Row className="items-baseline justify-between gap-2">
                <span className="text-ink-500 text-sm">
                  {sideProb
                    ? `${
                        pseudonym[selectedOutcome ?? 'YES'].pseudonymName
                      } probability`
                    : 'Probability'}
                </span>
                <span className="text-2xl">
                  {formatPercent(
                    sideProb
                      ? versusSideProb(selectedOutcome ?? 'YES', initialProb)
                      : initialProb
                  )}
                </span>
              </Row>
            </Col>
          )}
        </BuyPanel>
      </Col>
    </Modal>
  )
}

type TradeTicketProps = {
  contract: CPMMMultiContract | CPMMNumericContract
  multiProps: MultiBetProps
  trackingLocation: string
  onBuySuccess: () => void
  initialOutcome?: BinaryOutcomes
  title?: string
  description?: ReactNode
  /** Shown above the title, e.g. a link back to the answer list. */
  above?: ReactNode
  /** Shown below the probability, e.g. a picker between answers. */
  below?: ReactNode
  probabilityLabel?: string
  pseudonym?: ComponentProps<typeof BuyPanel>['pseudonym']
}

/** Compact ticket for one answer of a multi-answer market, including versus. */
export function TradeDialog(
  props: Omit<TradeTicketProps, 'onBuySuccess'> & {
    open: boolean
    setOpen: (open: boolean) => void
  }
) {
  const { open, setOpen, ...ticketProps } = props
  return (
    <TradeModal
      open={open}
      setOpen={setOpen}
      title={props.title ?? props.contract.question}
    >
      <TradeTicket
        {...ticketProps}
        onBuySuccess={() => setTimeout(() => setOpen(false), 500)}
      />
    </TradeModal>
  )
}

function TradeModal(props: {
  open: boolean
  setOpen: (open: boolean) => void
  title: string
  children: ReactNode
}) {
  const { open, setOpen, title, children } = props
  return (
    <Modal
      open={open}
      setOpen={setOpen}
      ariaLabel={`Bet on ${title}`}
      adaptToKeyboard
      closeButtonPosition="inside"
      className={clsx(MODAL_CLASS, '!px-4 !py-3 sm:!p-6')}
    >
      {children}
    </Modal>
  )
}

function TradeTicket(props: TradeTicketProps) {
  const {
    contract,
    multiProps,
    trackingLocation,
    onBuySuccess,
    initialOutcome,
    title = contract.question,
    description,
    above,
    below,
    probabilityLabel = 'Probability',
  } = props
  const pseudonym = props.pseudonym ?? {
    YES: { pseudonymName: 'YES', pseudonymColor: 'green' as const },
    NO: { pseudonymName: 'NO', pseudonymColor: 'red' as const },
  }

  const initialProb = getAnswerProbability(contract, multiProps.answerToBuy.id)
  // Named sides (e.g. Republican/Democratic) show the chosen side's chance;
  // plain YES/NO shows the YES chance, which buying NO moves down.
  const sideProb = showsSideProbability(contract, pseudonym)
  return (
    <BuyPanel
      key={contract.id + multiProps.answerToBuy.id}
      contract={contract}
      multiProps={multiProps}
      onBuySuccess={onBuySuccess}
      location={trackingLocation}
      inModal={true}
      initialOutcome={initialOutcome ?? 'YES'}
      alwaysShowOutcomeSwitcher
      compact
      pseudonym={pseudonym}
      className="!m-0 !p-0"
    >
      {(selectedOutcome) => {
        const label = sideProb
          ? `${pseudonym[selectedOutcome ?? 'YES'].pseudonymName} probability`
          : probabilityLabel
        return (
          <Col className="mb-2 gap-1">
            {above}
            <Link
              className="line-clamp-2 pr-7 text-lg font-semibold leading-snug hover:underline"
              href={contractPath(contract)}
              title={title}
            >
              {title}
            </Link>
            {description && (
              <div className="text-ink-600 text-sm">{description}</div>
            )}
            <Row className="items-baseline justify-between gap-2">
              <span
                className="text-ink-500 min-w-0 truncate text-sm"
                title={label}
              >
                {label}
              </span>
              <span className="shrink-0 text-lg font-semibold tabular-nums">
                {formatPercent(
                  sideProb
                    ? versusSideProb(selectedOutcome ?? 'YES', initialProb)
                    : initialProb
                )}
              </span>
            </Row>
            {below}
          </Col>
        )
      }}
    </BuyPanel>
  )
}

/** Three answers that sum to 100%, e.g. home / draw / away. */
export const isThreeWayMulti = (contract: Contract) =>
  isMultiCpmm(contract) &&
  contract.outcomeType === 'MULTIPLE_CHOICE' &&
  contract.answers.length === 3 &&
  contract.addAnswersMode === 'DISABLED' &&
  contract.shouldAnswersSumToOne

/** One ticket for a three-way market: pick an answer, then Yes or No. */
export function ThreeWayTradeDialog(props: {
  contract: CPMMMultiContract
  open: boolean
  setOpen: (open: boolean) => void
  trackingLocation: string
  initialAnswerId?: string
  /** Picker order, e.g. home / draw / away. Defaults to the market's order. */
  answerOrder?: (string | undefined)[]
  description?: ReactNode
}) {
  const {
    contract,
    open,
    setOpen,
    trackingLocation,
    initialAnswerId,
    answerOrder,
    description,
  } = props
  const byId = keyBy(contract.answers, 'id')
  const ordered = (answerOrder ?? []).flatMap((id) =>
    id && byId[id] ? [byId[id]] : []
  )
  const choices =
    ordered.length === contract.answers.length
      ? ordered
      : sortBy(contract.answers, 'index')
  const [answerId, setAnswerId] = useState(
    initialAnswerId && byId[initialAnswerId] ? initialAnswerId : choices[0].id
  )
  const answer = byId[answerId] ?? choices[0]

  return (
    <TradeDialog
      contract={contract}
      multiProps={{ answers: contract.answers, answerToBuy: answer }}
      open={open}
      setOpen={setOpen}
      trackingLocation={trackingLocation}
      description={description}
      probabilityLabel={`${answer.text} probability`}
      below={
        <AnswerPicker
          contract={contract}
          answers={choices}
          selectedId={answer.id}
          onSelect={setAnswerId}
        />
      }
    />
  )
}

function AnswerPicker(props: {
  contract: CPMMMultiContract
  answers: Answer[]
  selectedId: string
  onSelect: (answerId: string) => void
}) {
  const { contract, answers, selectedId, onSelect } = props
  return (
    <Row role="group" aria-label="Choose an answer" className="mt-1 gap-1">
      {answers.map((a) => {
        const selected = a.id === selectedId
        return (
          <button
            key={a.id}
            type="button"
            title={a.text}
            aria-pressed={selected}
            onClick={() => onSelect(a.id)}
            className={clsx(
              'flex min-w-0 flex-1 flex-col items-center rounded-md border px-1 py-1.5 text-sm',
              selected
                ? 'border-primary-500 bg-primary-50 text-primary-800'
                : 'text-ink-600 hover:bg-canvas-50 border-ink-200'
            )}
          >
            <span className="line-clamp-1 font-medium">{a.text}</span>
            <span className="text-xs tabular-nums">
              {formatPercent(getAnswerProbability(contract, a.id))}
            </span>
          </button>
        )
      })}
    </Row>
  )
}

const ANSWER_LIST_LIMIT = 6
const ANSWER_SEARCH_THRESHOLD = 8

/** Answer list for a multiple choice market. Yes or No swaps in a ticket. */
function MultiChoiceTradeDialog(props: {
  contract: CPMMMultiContract
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const { contract, open, setOpen } = props
  const [selected, setSelected] = useState<{
    answerId: string
    outcome: 'YES' | 'NO'
  }>()
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)

  const answers = sortBy(
    contract.answers.filter((a) => !a.resolution),
    (a) => -getAnswerProbability(contract, a.id)
  )
  const selectedAnswer =
    selected && answers.find((a) => a.id === selected.answerId)
  const matching = query
    ? answers.filter((a) => a.text.toLowerCase().includes(query.toLowerCase()))
    : answers
  const shown =
    showAll || query ? matching : matching.slice(0, ANSWER_LIST_LIMIT)

  return (
    <TradeModal open={open} setOpen={setOpen} title={contract.question}>
      {selected && selectedAnswer ? (
        <TradeTicket
          contract={contract}
          multiProps={{
            answers: contract.answers,
            answerToBuy: selectedAnswer,
          }}
          trackingLocation="multi bet dialog"
          onBuySuccess={() => setTimeout(() => setOpen(false), 500)}
          initialOutcome={selected.outcome}
          title={selectedAnswer.text}
          description={contract.question}
          above={
            <button
              type="button"
              onClick={() => setSelected(undefined)}
              className="text-primary-700 hover:bg-primary-50 -ml-2 flex items-center gap-1 self-start rounded-md px-2 py-1 text-sm font-medium"
            >
              <ArrowLeftIcon className="h-4 w-4" aria-hidden />
              All answers
            </button>
          }
        />
      ) : (
        <Col className="gap-2">
          <Link
            className="line-clamp-2 pr-7 text-lg font-semibold leading-snug hover:underline"
            href={contractPath(contract)}
            title={contract.question}
          >
            {contract.question}
          </Link>
          {answers.length > ANSWER_SEARCH_THRESHOLD && (
            <Input
              type="search"
              placeholder="Search answers"
              aria-label="Search answers"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          )}
          <Col className="divide-ink-200 divide-y">
            {shown.map((a) => (
              <Row key={a.id} className="items-center gap-2 py-2">
                <span className="line-clamp-2 min-w-0 flex-1 text-sm">
                  {a.text}
                </span>
                <span className="shrink-0 font-semibold tabular-nums">
                  {formatPercent(getAnswerProbability(contract, a.id))}
                </span>
                <Button
                  size="2xs"
                  color="green-outline"
                  aria-label={`Bet Yes on ${a.text}`}
                  onClick={() =>
                    setSelected({ answerId: a.id, outcome: 'YES' })
                  }
                >
                  Yes
                </Button>
                <Button
                  size="2xs"
                  color="red-outline"
                  aria-label={`Bet No on ${a.text}`}
                  onClick={() => setSelected({ answerId: a.id, outcome: 'NO' })}
                >
                  No
                </Button>
              </Row>
            ))}
          </Col>
          {query && matching.length === 0 && (
            <p className="text-ink-500 py-4 text-center text-sm">
              No answers match.
            </p>
          )}
          {!showAll && !query && matching.length > ANSWER_LIST_LIMIT && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="text-primary-700 hover:bg-primary-50 self-start rounded-md px-2 py-1 text-sm font-medium"
            >
              Show {matching.length - ANSWER_LIST_LIMIT} more
            </button>
          )}
        </Col>
      )}
    </TradeModal>
  )
}

export function MultiBetDialog(props: {
  contract: CPMMMultiContract | CPMMNumericContract
  open: boolean
  setOpen: (open: boolean) => void
  /** For two-answer "versus" markets: open on this side. */
  initialOutcome?: 'YES' | 'NO'
}) {
  const { contract, open, setOpen, initialOutcome } = props
  const { question } = contract
  const [query, setQuery] = usePersistentInMemoryState(
    '',
    'create-answer-text' + contract.id
  )
  const defaultSort = getDefaultSort(contract)

  const [sort, setSort] = usePersistentInMemoryState<MultiSort>(
    defaultSort,
    'answer-sort' + contract.id
  )

  const isBinaryMC = isBinaryMulti(contract)
  if (isBinaryMC && !contract.isResolved) {
    const versusContract = contract as CPMMMultiContract
    const main = getMainBinaryMCAnswer(versusContract)!
    const other = versusContract.answers.find((a) => a.id !== main.id)!
    return (
      <TradeDialog
        contract={versusContract}
        multiProps={{ answers: versusContract.answers, answerToBuy: main }}
        open={open}
        setOpen={setOpen}
        initialOutcome={initialOutcome}
        trackingLocation="versus bet dialog"
        pseudonym={{
          YES: {
            pseudonymName: main.text,
            pseudonymColor: getAnswerColor(main) as `#${string}`,
          },
          NO: {
            pseudonymName: other.text,
            pseudonymColor: getAnswerColor(other) as `#${string}`,
          },
        }}
      />
    )
  }
  if (contract.outcomeType === 'MULTIPLE_CHOICE' && !contract.isResolved) {
    const multi = contract as CPMMMultiContract
    return isThreeWayMulti(multi) ? (
      <ThreeWayTradeDialog
        contract={multi}
        open={open}
        setOpen={setOpen}
        trackingLocation="three-way bet dialog"
      />
    ) : (
      <MultiChoiceTradeDialog contract={multi} open={open} setOpen={setOpen} />
    )
  }
  return (
    <Modal
      open={open}
      setOpen={setOpen}
      ariaLabel={`Bet on ${question}`}
      size={'lg'}
      className={clsx(
        MODAL_CLASS,
        'pointer-events-auto max-h-[32rem] overflow-auto'
      )}
    >
      <Col>
        {contract.outcomeType === 'NUMBER' ? (
          <NumericBetDialog contract={contract as CPMMNumericContract} />
        ) : (
          <>
            <Link
              href={contractPath(contract)}
              className={clsx('text-primary-700 text-xl', linkClass)}
            >
              {question}
            </Link>
            {isBinaryMC ? (
              <BinaryMultiAnswersPanel
                contract={contract as CPMMMultiContract}
              />
            ) : (
              <AnswersPanel
                contract={contract}
                selectedAnswerIds={[]}
                sort={sort}
                setSort={setSort}
                query={query}
                setQuery={setQuery}
                onAnswerHover={() => null}
                onAnswerClick={() => null}
                defaultAddAnswer={contract.addAnswersMode === 'ANYONE'}
                floatingSearchClassName={'-top-8 pt-4'}
              />
            )}
          </>
        )}
      </Col>
    </Modal>
  )
}

const NumericBetDialog = (props: { contract: CPMMNumericContract }) => {
  const { contract } = props
  const { question } = contract
  return (
    <Col>
      <Row className={'mb-2 justify-between'}>
        <Link
          href={contractPath(contract)}
          className={clsx('text-primary-700 mb-4 text-xl', linkClass)}
        >
          {question}
        </Link>
        <NumberResolutionOrExpectation contract={contract} />
      </Row>
      <NumericBetPanel contract={contract} />
    </Col>
  )
}
