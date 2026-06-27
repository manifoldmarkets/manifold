import clsx from 'clsx'
import { PencilIcon } from '@heroicons/react/solid'
import { Answer } from 'common/answer'
import { CPMMMultiContract, getMainBinaryMCAnswer } from 'common/contract'
import { formatPercent } from 'common/util/format'
import { useState } from 'react'
import { BuyPanelBody } from 'web/components/bet/bet-panel'
import { Button, SizeType } from 'web/components/buttons/button'
import { useUser } from 'web/hooks/use-user'
import { track } from 'web/lib/service/analytics'
import { getAnswerColor } from '../charts/contract/choice'
import { Row } from '../layout/row'
import {
  AnswerComponent,
  EditAnswerModal,
  canEditAnswer,
} from './answers-panel'

export function BinaryMultiAnswersPanel(props: {
  contract: CPMMMultiContract
  feedReason?: string
  // When set (e.g. inside a bet modal), skip the two-step "pick a side first"
  // picker: open pre-selected on a side with a persistent two-side selector so
  // both options stay visible and switching sides updates the panel in place.
  preselect?: boolean
  onClose?: () => void
}) {
  const { feedReason, contract, preselect, onClose } = props
  const answers = contract.answers
  const user = useUser()

  const [outcome, setOutcome] = useState<'YES' | 'NO' | undefined>(
    preselect ? 'YES' : undefined
  )

  if (contract.isResolved) {
    return (
      <>
        {answers.map((answer) => (
          <AnswerComponent
            shouldShowLimitOrderChart={false}
            key={answer.id}
            user={null}
            answer={answer}
            contract={contract}
            color={getAnswerColor(answer)}
            feedReason={feedReason}
          />
        ))}
      </>
    )
  }

  if (preselect) {
    const selected = outcome ?? 'YES'
    return (
      <BinaryMultiChoiceBetPanel
        answer={selected === 'YES' ? answers[0] : answers[1]}
        contract={contract}
        outcome={selected}
        setOutcome={setOutcome}
        closePanel={onClose ?? (() => setOutcome('YES'))}
        showSelector
      />
    )
  }

  return (
    <>
      {outcome === undefined ? (
        <div className="mx-[2px] mt-1 flex flex-col justify-between gap-2 sm:flex-row">
          {answers.map((answer, i) => (
            <BetButton
              outcome={i === 0 ? 'YES' : 'NO'}
              setOutcome={setOutcome}
              key={answer.id}
              answer={answer}
              contract={contract}
              color={getAnswerColor(answer)}
              canEdit={!!canEditAnswer(answer, contract, user)}
            />
          ))}
        </div>
      ) : (
        <BinaryMultiChoiceBetPanel
          answer={outcome === 'YES' ? answers[0] : answers[1]}
          contract={contract}
          outcome={outcome}
          setOutcome={setOutcome}
          closePanel={() => setOutcome(undefined)}
        />
      )}
    </>
  )
}

const BetButton = (props: {
  answer: Answer
  contract: CPMMMultiContract
  outcome: 'YES' | 'NO'
  setOutcome: (outcome: 'YES' | 'NO') => void
  color?: string
  size?: SizeType
  canEdit?: boolean
}) => {
  const { answer, contract, size, outcome, setOutcome, color, canEdit } = props
  const user = useUser()
  const isCreatorBanned =
    !!user &&
    user.id === contract.creatorId &&
    contract.creatorBannedFromBetting === true
  const [editing, setEditing] = useState(false)

  if (isCreatorBanned) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
        <span className="font-medium">Betting disabled</span>
      </div>
    )
  }

  return (
    <div className="group relative flex flex-1">
      <Button
        size={size ?? 'xl'}
        color="none"
        aria-label={`Bet ${outcome} on ${answer.text}`}
        aria-haspopup="dialog"
        style={{ backgroundColor: color }}
        className={'flex w-full items-center justify-between gap-1 text-white'}
        onClick={() => {
          // TODO: Twomba tracking bet terminology
          track('bet intent', { location: 'answer panel' })
          setOutcome(outcome)
        }}
      >
        <span className="line-clamp-1 text-left sm:line-clamp-2">
          {answer.text}
        </span>
        <span className={'text-xl'}>{formatPercent(answer.prob)}</span>
      </Button>
      {canEdit && (
        <button
          className="bg-canvas-0/80 hover:bg-canvas-0 absolute right-1 top-1 rounded p-1 opacity-80 transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
          aria-label={`Edit answer ${answer.text}`}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setEditing(true)
          }}
        >
          <PencilIcon className="text-primary-700 h-4 w-4" />
        </button>
      )}
      <EditAnswerModal
        open={editing}
        setOpen={setEditing}
        contract={contract}
        answer={answer}
        color={color ?? getAnswerColor(answer)}
      />
    </div>
  )
}

function BinaryMultiChoiceBetPanel(props: {
  answer: Answer
  contract: CPMMMultiContract
  closePanel: () => void
  outcome: 'YES' | 'NO' | undefined
  setOutcome: (outcome: 'YES' | 'NO') => void
  // Render a persistent two-side selector (both options visible) at the top of
  // the panel instead of the single selected-answer header.
  showSelector?: boolean
}) {
  const { answer, contract, closePanel, outcome, setOutcome, showSelector } =
    props

  const [editing, setEditing] = useState(false)
  const color = getAnswerColor(answer)
  const user = useUser()
  const canEdit = canEditAnswer(answer, contract, user)
  const mainAnswer = getMainBinaryMCAnswer(contract)!
  const otherAnswer = contract.answers.find((a) => a.id !== mainAnswer.id)!
  const mainAnswerColor = getAnswerColor(mainAnswer) as `#${string}`
  const otherAnswerColor = getAnswerColor(otherAnswer) as `#${string}`
  return (
    <BuyPanelBody
      contract={contract}
      multiProps={{
        answers: contract.answers,
        answerToBuy: contract.answers[0],
        answerText: answer.text,
      }}
      pseudonym={{
        YES: {
          pseudonymName: mainAnswer.text,
          pseudonymColor: mainAnswerColor,
        },
        NO: {
          pseudonymName: otherAnswer.text,
          pseudonymColor: otherAnswerColor,
        },
      }}
      outcome={outcome}
      setOutcome={setOutcome}
      onBuySuccess={() => setTimeout(closePanel, 500)}
      onClose={closePanel}
      location={'contract page answer'}
      className="bg-canvas-50"
    >
      {showSelector ? (
        <Row className="bg-canvas-100 mb-1 mt-1 w-full items-stretch gap-1 rounded-lg p-1">
          {contract.answers.map((a, i) => {
            const oc = i === 0 ? 'YES' : 'NO'
            const isSelected = outcome === oc
            return (
              <button
                key={a.id}
                onClick={() => setOutcome(oc)}
                aria-label={`Bet ${a.text}`}
                className={clsx(
                  'flex min-w-0 flex-1 items-center justify-between gap-1 truncate rounded-md px-3 py-2 text-base font-semibold transition-colors',
                  isSelected ? 'text-white' : 'text-ink-600 hover:text-ink-900'
                )}
                style={
                  isSelected
                    ? { backgroundColor: getAnswerColor(a) }
                    : undefined
                }
              >
                <span className="truncate">{a.text}</span>
                <span className="shrink-0">{formatPercent(a.prob)}</span>
              </button>
            )
          })}
        </Row>
      ) : (
        <Row className="items-baseline justify-between">
          <div className={'group mr-6 text-2xl'}>
            {answer.text}
            {canEdit && user && (
              <div>
                <Button
                  color="gray-white"
                  aria-label={`Edit answer ${answer.text}`}
                  className="visible group-hover:visible sm:invisible"
                  size="xs"
                  onClick={() => setEditing(true)}
                >
                  <PencilIcon className="text-primary-700 h-4 w-4" />
                </Button>
                <EditAnswerModal
                  open={editing}
                  setOpen={setEditing}
                  contract={contract}
                  answer={answer}
                  color={color}
                />
              </div>
            )}
          </div>
          <span className="text-2xl">{formatPercent(answer.prob)}</span>
        </Row>
      )}
    </BuyPanelBody>
  )
}
