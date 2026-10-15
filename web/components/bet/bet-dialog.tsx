import clsx from 'clsx'

import {
  contractPath,
  BinaryOrPseudoNumericContract,
  CPMMMultiContract,
  CPMMNumericContract,
  isBinaryMulti,
  getMainBinaryMCAnswer,
} from 'common/contract'
import { Col } from '../layout/col'
import { Modal, MODAL_CLASS } from '../layout/modal'
import { BinaryOutcomes, BuyPanel } from './bet-panel'
import { getDefaultSort, MultiSort } from 'common/answer'
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
import { ComponentProps, ReactNode } from 'react'
import { MultiBetProps } from 'client-common/lib/bet'
import { getAnswerColor } from '../charts/contract/choice'

export function BetDialog(props: {
  contract: BinaryOrPseudoNumericContract
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

  return (
    <TradeDialog
      contract={contract}
      open={open}
      setOpen={setOpen}
      trackingLocation={trackingLocation}
      initialOutcome={initialOutcome}
      title={questionPseudonym}
      pseudonym={props.binaryPseudonym}
    />
  )
}

/** Shared ticket for cpmm-1 markets, versus markets and individual answers. */
export function TradeDialog(
  props: {
    open: boolean
    setOpen: (open: boolean) => void
    trackingLocation: string
    initialOutcome?: BinaryOutcomes
    title?: string
    description?: ReactNode
    pseudonym?: ComponentProps<typeof BuyPanel>['pseudonym']
  } & (
    | { contract: BinaryOrPseudoNumericContract; multiProps?: never }
    | {
        contract: CPMMMultiContract | CPMMNumericContract
        multiProps: MultiBetProps
      }
  )
) {
  const {
    contract,
    multiProps,
    open,
    setOpen,
    trackingLocation,
    initialOutcome,
    title = contract.question,
    description,
  } = props
  const pseudonym = props.pseudonym ?? {
    YES: { pseudonymName: 'YES', pseudonymColor: 'green' as const },
    NO: { pseudonymName: 'NO', pseudonymColor: 'red' as const },
  }

  const initialProb = multiProps
    ? getAnswerProbability(contract, multiProps.answerToBuy.id)
    : getProbability(contract)
  // Named sides (e.g. Republican/Democratic) show the chosen side's chance;
  // plain YES/NO shows the YES chance, which buying NO moves down.
  const sideProb = showsSideProbability(contract, pseudonym)
  return (
    <Modal
      open={open}
      setOpen={setOpen}
      ariaLabel={`Bet on ${title}`}
      adaptToKeyboard
      closeButtonPosition="inside"
      className={clsx(MODAL_CLASS, '!px-4 !py-3 sm:!p-6')}
    >
      <BuyPanel
        key={contract.id + (multiProps?.answerToBuy.id ?? '')}
        contract={contract}
        multiProps={multiProps}
        onBuySuccess={() => setTimeout(() => setOpen(false), 500)}
        location={trackingLocation}
        inModal={true}
        initialOutcome={initialOutcome ?? 'YES'}
        alwaysShowOutcomeSwitcher
        compact
        pseudonym={pseudonym}
        className="!m-0 !p-0"
      >
        {(selectedOutcome) => (
          <Col className="mb-2 gap-1">
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
                title={
                  sideProb
                    ? `${
                        pseudonym[selectedOutcome ?? 'YES'].pseudonymName
                      } probability`
                    : 'Probability'
                }
              >
                {sideProb
                  ? `${
                      pseudonym[selectedOutcome ?? 'YES'].pseudonymName
                    } probability`
                  : 'Probability'}
              </span>
              <span className="shrink-0 text-lg font-semibold tabular-nums">
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
    </Modal>
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
