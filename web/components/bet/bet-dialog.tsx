import clsx from 'clsx'

import {
  contractPath,
  CPMMBinaryContract,
  CPMMMultiContract,
  isBinaryMulti,
} from 'common/contract'
import { useUser } from 'web/hooks/use-user'
import { Col } from '../layout/col'
import { Modal, MODAL_CLASS } from '../layout/modal'
import { BinaryOutcomes, BuyPanel } from './bet-panel'
import { Subtitle } from '../widgets/subtitle'
import { getDefaultSort, MultiSort } from 'common/answer'
import Link from 'next/link'
import { linkClass } from 'web/components/widgets/site-link'
import { AnswersPanel } from 'web/components/answers/answers-panel'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { BinaryMultiAnswersPanel } from 'web/components/answers/binary-multi-answers-panel'

export function BetDialog(props: {
  contract: CPMMBinaryContract
  initialOutcome: BinaryOutcomes
  open: boolean
  setOpen: (open: boolean) => void
  trackingLocation: string
}) {
  const { contract, initialOutcome, open, setOpen, trackingLocation } = props
  const user = useUser()
  const { question } = contract

  return (
    <Modal
      open={open}
      setOpen={setOpen}
      className={clsx(
        MODAL_CLASS,
        'pointer-events-auto max-h-[32rem] overflow-auto'
      )}
    >
      <Col>
        <Subtitle className="!mb-4 !mt-0 !text-xl">{question}</Subtitle>
        <BuyPanel
          contract={contract}
          user={user}
          initialOutcome={initialOutcome}
          onBuySuccess={() => setTimeout(() => setOpen(false), 500)}
          location={trackingLocation}
          inModal={true}
        />
      </Col>
    </Modal>
  )
}
export function MultiBetDialog(props: {
  contract: CPMMMultiContract
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
        <Link
          href={contractPath(contract)}
          className={clsx('mb-4 text-xl text-indigo-700', linkClass)}
        >
          {question}
        </Link>
        {isBinaryMC ? (
          <BinaryMultiAnswersPanel
            contract={contract}
            answers={contract.answers}
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
          />
        )}
      </Col>
    </Modal>
  )
}
