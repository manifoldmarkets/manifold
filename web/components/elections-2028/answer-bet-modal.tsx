import clsx from 'clsx'

import { Answer } from 'common/answer'
import { CPMMMultiContract, MultiContract } from 'common/contract'
import { AnswerCpmmBetPanel } from 'web/components/answers/answer-bet-panel'
import {
  Modal,
  MODAL_CLASS,
  SCROLLABLE_MODAL_CLASS,
} from 'web/components/layout/modal'

// Bet on one answer of a multiple choice market without leaving the page.
// The contract must be the full live market: the bet preview prices every
// answer, so a trimmed answer list would misquote it.
export function AnswerBetModal(props: {
  contract: MultiContract
  answer: Answer | undefined
  onClose: () => void
}) {
  const { contract, answer, onClose } = props
  return (
    <Modal
      open={answer !== undefined}
      setOpen={(open) => !open && onClose()}
      className={clsx(MODAL_CLASS, SCROLLABLE_MODAL_CLASS)}
    >
      {answer && (
        <AnswerCpmmBetPanel
          answer={answer}
          contract={contract as CPMMMultiContract}
          outcome="YES"
          closePanel={onClose}
          alwaysShowOutcomeSwitcher
        />
      )}
    </Modal>
  )
}
