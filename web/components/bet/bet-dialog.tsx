import clsx from 'clsx'

import {
  contractPath,
  BinaryContract,
  CPMMMultiContract,
  CPMMNumericContract,
  isBinaryMulti,
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
import { getProbability } from 'common/calculate'
import { formatPercent } from 'common/util/format'
import { showsSideProbability, versusSideProb } from 'common/versus'

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
                preselect
                preselectOutcome={initialOutcome}
                onClose={() => setOpen(false)}
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
