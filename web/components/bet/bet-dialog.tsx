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
import { sliderColors } from '../widgets/slider'
import { getProbability } from 'common/calculate'
import { formatPercent } from 'common/util/format'

export function BetDialog(props: {
  contract: BinaryContract
  open: boolean
  setOpen: (open: boolean) => void
  trackingLocation: string
  initialOutcome?: BinaryOutcomes
  binaryPseudonym?: {
    YES: {
      pseudonymName: string
      pseudonymColor: keyof typeof sliderColors
    }
    NO: {
      pseudonymName: string
      pseudonymColor: keyof typeof sliderColors
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

  const initialProb = getProbability(contract)
  return (
    <Modal
      open={open}
      setOpen={setOpen}
      className={clsx(MODAL_CLASS, '!px-0 !py-0')}
    >
      <Col className="max-h-[42rem] overflow-auto px-4 py-4">
        <Row className="items-baseline justify-between gap-2">
          <Link
            className="!text-xl hover:underline"
            href={contractPath(contract)}
          >
            {questionPseudonym ?? question}
          </Link>
          <div className="text-2xl">
            {formatPercent(initialProb)} <span className="text-sm">chance</span>
          </div>
        </Row>
        <BuyPanel
          contract={contract}
          onBuySuccess={() => setTimeout(() => setOpen(false), 500)}
          location={trackingLocation}
          inModal={true}
          initialOutcome={initialOutcome ?? 'YES'}
          alwaysShowOutcomeSwitcher
          pseudonym={props.binaryPseudonym}
          className="!px-0"
        />
      </Col>
    </Modal>
  )
}

export function MultiBetDialog(props: {
  contract: CPMMMultiContract | CPMMNumericContract
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const { contract, open, setOpen } = props
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
