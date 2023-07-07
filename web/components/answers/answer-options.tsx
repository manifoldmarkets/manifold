import { ChatIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { Answer, DpmAnswer } from 'common/answer'
import {
  CPMMMultiContract,
  DpmMultipleChoiceContract,
  FreeResponseContract,
} from 'common/contract'
import { formatPercent } from 'common/util/format'
import { useState } from 'react'
import { IconButton, Button } from '../buttons/button'
import { Modal, MODAL_CLASS } from '../layout/modal'
import { AnswerBetPanel, AnswerCpmmBetPanel } from './answer-bet-panel'
import { useUser } from 'web/hooks/use-user'

// All items on the right side of an answer bar

export const AddComment = (props: { onClick: () => void }) => {
  return (
    <IconButton onClick={props.onClick} className="!p-1">
      <ChatIcon className="h-5 w-5" />
    </IconButton>
  )
}

export const DPMMultiBettor = (props: {
  answer: DpmAnswer
  contract: DpmMultipleChoiceContract | FreeResponseContract
}) => {
  const { answer, contract } = props
  const [open, setOpen] = useState(false)

  return (
    <>
      <Modal open={open} setOpen={setOpen} className={MODAL_CLASS}>
        <AnswerBetPanel
          answer={answer}
          contract={contract}
          closePanel={() => setOpen(false)}
        />
      </Modal>

      <Button size="2xs" onClick={() => setOpen(true)}>
        Bet
      </Button>
    </>
  )
}

export const MultiBettor = (props: {
  answer: Answer
  contract: CPMMMultiContract
}) => {
  const { answer, contract } = props
  const [outcome, setOutcome] = useState<'YES' | 'NO' | 'LIMIT' | undefined>(
    undefined
  )

  const user = useUser()

  return (
    <>
      <Modal
        open={outcome != undefined}
        setOpen={(open) => setOutcome(open ? 'YES' : undefined)}
        className={MODAL_CLASS}
      >
        <AnswerCpmmBetPanel
          answer={answer}
          contract={contract}
          outcome={outcome}
          closePanel={() => setOutcome(undefined)}
          me={user}
        />
      </Modal>

      <Button size="2xs" color="green" onClick={() => setOutcome('YES')}>
        YES
      </Button>
      <Button size="2xs" color="red" onClick={() => setOutcome('NO')}>
        NO
      </Button>
      <Button
        size="2xs"
        color="indigo-outline"
        onClick={() => setOutcome('LIMIT')}
      >
        %
      </Button>
    </>
  )
}

export const OpenProb = (props: { prob: number }) => (
  <span className="text-ink-900 text-xl">{formatPercent(props.prob)}</span>
)

export const ClosedProb = (props: { prob: number; resolvedProb?: number }) => {
  const { prob, resolvedProb: resolveProb } = props
  return (
    <>
      {!!resolveProb && (
        <span className="dark:text-ink-900 text-xl text-purple-500">
          {Math.round(resolveProb * 100)}%
        </span>
      )}
      <span
        className={clsx(
          'text-ink-500 text-xl',
          resolveProb != undefined &&
            'inline-block min-w-[40px] text-right line-through'
        )}
      >
        {formatPercent(prob)}
      </span>
    </>
  )
}
