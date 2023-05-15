import { useState } from 'react'
import { groupBy, sortBy, sumBy } from 'lodash'
import clsx from 'clsx'
import {
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/outline'

import { MAX_DESCRIPTION_LENGTH, MAX_QUESTION_LENGTH } from 'common/contract'
import { ENV_CONFIG } from 'common/envs/constants'
import { MAX_QA_ANSWER_LENGTH, q_and_a, q_and_a_answer } from 'common/q-and-a'
import { formatMoney } from 'common/util/format'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { AmountInput } from 'web/components/widgets/amount-input'
import { Avatar, EmptyAvatar } from 'web/components/widgets/avatar'
import { ExpandingInput } from 'web/components/widgets/expanding-input'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { useUserById } from 'web/hooks/use-user-supabase'
import {
  awardQAndAAnswer,
  createQAndA,
  createQAndAAnswer,
} from 'web/lib/firebase/api'
import { Title } from 'web/components/widgets/title'
import { useBountyRemaining, useQAndA } from 'web/lib/supabase/q-and-a'
import { useUser } from 'web/hooks/use-user'
import { MODAL_CLASS, Modal } from 'web/components/layout/modal'
import { fromNow } from 'web/lib/util/time'
import { Linkify } from 'web/components/widgets/linkify'
import { UserLink } from 'web/components/widgets/user-link'

export default function QuestionAndAnswer() {
  const { questions, answers } = useQAndA()
  const visibleQuestions = questions.filter((q) => !q.deleted)
  const visibleAnswers = answers.filter((a) => !a.deleted)
  const answersByQuestion = groupBy(visibleAnswers, 'q_and_a_id')
  const user = useUser()
  return (
    <Page>
      <Col className="mx-auto w-full max-w-2xl gap-4 pb-8 pt-2 sm:pt-0">
        <Title className="mx-4 !mb-0 sm:mx-0">Q&A</Title>
        {visibleQuestions.map((q) => (
          <QuestionAnswer
            key={q.id}
            question={q}
            answers={answersByQuestion[q.id] ?? []}
            isCreator={user?.id === q.user_id}
          />
        ))}
        <div className="my-6 w-full border-t" />
        <CreateQAndA />
      </Col>
    </Page>
  )
}

function QuestionAnswer(props: {
  question: q_and_a
  answers: q_and_a_answer[]
  isCreator: boolean
}) {
  const { question, answers, isCreator } = props
  const user = useUserById(question.user_id)
  const sortedAnwers = sortBy(answers, 'award', 'created_time').reverse()

  const [expanded, setExpanded] = useState(false)

  const noBountyRemaining = question.bounty === sumBy(answers, 'award')

  return (
    <Col className="gap-2">
      <Col
        className="bg-canvas-0 cursor-pointer px-4 py-3 shadow"
        onClick={() => setExpanded((b) => !b)}
      >
        <Row className="justify-between">
          <Row className="items-center gap-1">
            {noBountyRemaining && <CheckCircleIcon className="h-6 w-6 " />}
            <div className="text-lg">{question.question}</div>
          </Row>
          {expanded ? (
            <ChevronUpIcon className="text-ink-600 h-6 w-6 flex-shrink-0 text-xs">
              Hide
            </ChevronUpIcon>
          ) : (
            <ChevronDownIcon className="text-ink-600 h-6 w-6 flex-shrink-0 text-xs">
              Show
            </ChevronDownIcon>
          )}
        </Row>
        <div
          className={clsx(
            'text-ink-600',
            expanded ? 'whitespace-pre-line' : 'line-clamp-1'
          )}
        >
          <Linkify text={question.description} />
        </div>
        <Row className="text-ink-600 mt-1 items-center gap-2 text-sm">
          {user ? (
            <Row className="gap-2">
              <Avatar
                size="xs"
                avatarUrl={user.avatarUrl}
                username={user.username}
                noLink={!expanded}
              />
              <UserLink
                name={user.name}
                username={user.username}
                noLink={!expanded}
              />
            </Row>
          ) : (
            <EmptyAvatar size={6} />
          )}
          <div>
            <span className="font-semibold">
              {formatMoney(question.bounty)}
            </span>{' '}
            bounty
          </div>
          <div>{fromNow(question.created_time)}</div>
        </Row>
      </Col>
      <Col
        className={clsx(
          'ml-6 gap-2',
          answers.length > 0 && 'mb-2',
          !expanded && 'cursor-pointer'
        )}
        onClick={expanded ? undefined : () => setExpanded(true)}
      >
        {(expanded ? sortedAnwers : sortedAnwers.slice(0, 3)).map((a) => (
          <Answer
            key={a.id}
            answer={a}
            expanded={expanded}
            isCreator={isCreator}
          />
        ))}
        {expanded && <CreateAnswer questionId={question.id} />}
      </Col>
    </Col>
  )
}

function Answer(props: {
  answer: q_and_a_answer
  isCreator: boolean
  expanded: boolean
}) {
  const { answer, isCreator, expanded } = props
  const user = useUserById(answer.user_id)

  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <Col>
      <Row className="mr-1 items-start gap-2">
        {user ? (
          <Avatar
            size="xs"
            avatarUrl={user.avatarUrl}
            username={user.username}
            noLink={!expanded}
          />
        ) : (
          <EmptyAvatar size={6} />
        )}
        {answer.award > 0 && (
          <div className="text-sm font-semibold text-green-600">
            {formatMoney(answer.award)}
          </div>
        )}
        <div
          className={clsx(expanded ? 'whitespace-pre-line' : 'line-clamp-1')}
        >
          <Linkify text={answer.text} />
        </div>
        {isCreator && expanded && (
          <>
            <Button
              size="2xs"
              className="mb-0.5 ml-auto"
              onClick={(e) => {
                e.stopPropagation()
                setDialogOpen(true)
              }}
            >
              Award
            </Button>
            {dialogOpen && (
              <AwardAnswerDialog answer={answer} setOpen={setDialogOpen} />
            )}
          </>
        )}
      </Row>
      {expanded && (
        <div className="text-ink-600 ml-8 mt-0.5 text-xs">
          {fromNow(answer.created_time)}
        </div>
      )}
    </Col>
  )
}

function AwardAnswerDialog(props: {
  answer: q_and_a_answer
  setOpen: (b: boolean) => void
}) {
  const { answer, setOpen } = props
  const [amount, setAmount] = useState<number | undefined>(10)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const bountyRemaining = useBountyRemaining(answer.q_and_a_id)
  const isValid =
    amount !== undefined &&
    amount > 0 &&
    bountyRemaining !== undefined &&
    amount <= bountyRemaining

  const submit = async () => {
    if (isValid) {
      setIsSubmitting(true)
      await awardQAndAAnswer({ answerId: answer.id, amount })
      setIsSubmitting(false)
      setOpen(false)
    }
  }

  return (
    <Modal className={clsx(MODAL_CLASS, '')} open={true} setOpen={setOpen}>
      <Col className="gap-4">
        <Title className="!mb-0">Award answer</Title>

        <div>{answer.text}</div>

        <div className="text-ink-600">
          Awarding an answer will transfer a portion of the bounty to the user
          who created the answer.
        </div>

        <Col>
          <div>Remaining bounty</div>
          <div>{formatMoney(bountyRemaining ?? 0)}</div>
        </Col>

        <div>Award amount</div>

        <AmountInput
          className="w-full"
          amount={amount}
          onChange={setAmount}
          error={
            isValid || bountyRemaining === undefined
              ? undefined
              : 'Invalid amount'
          }
          label={ENV_CONFIG.moneyMoniker}
        />
        <Row className="mt-4">
          <Button
            className="flex-1"
            disabled={!isValid}
            onClick={submit}
            loading={isSubmitting}
          >
            Award
          </Button>
        </Row>
      </Col>
    </Modal>
  )
}

function CreateAnswer(props: { questionId: string }) {
  const { questionId } = props
  const [text, setText] = usePersistentInMemoryState(
    '',
    'q-and-a-answer' + questionId
  )
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isValid = text.length > 0

  const submit = async () => {
    if (!isValid) return

    setIsSubmitting(true)
    await createQAndAAnswer({ questionId, text })
    setIsSubmitting(false)
    setText('')
  }

  return (
    <Col className="mt-1 w-full pr-1" onClick={(e) => e.stopPropagation()}>
      <Row className="items-end gap-2">
        <ExpandingInput
          className="flex-1 !text-sm"
          placeholder="Submit an answer"
          maxLength={MAX_QA_ANSWER_LENGTH}
          value={text}
          onChange={(e) => setText(e.target.value || '')}
        />
        <Button
          className="mb-0.5"
          size="sm"
          disabled={!isValid || isSubmitting}
          onClick={submit}
        >
          {isSubmitting ? 'Submitting...' : 'Submit'}
        </Button>
      </Row>
    </Col>
  )
}

function CreateQAndA() {
  const [question, setQuestion] = usePersistentInMemoryState(
    '',
    'q-and-a-question'
  )
  const [description, setDescription] = useState('')
  const [bounty, setBounty] = useState<number | undefined>(50)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isValid = question.length > 0 && bounty !== undefined && bounty > 0

  const submit = async () => {
    if (!isValid) return

    setIsSubmitting(true)

    await createQAndA({ question, description, bounty })

    setQuestion('')
    setDescription('')
    setBounty(50)
    setIsSubmitting(false)
  }

  return (
    <Col className="gap-4 px-4 sm:px-0">
      <Title className="!mb-0">Ask your question</Title>

      <Col className="w-full">
        <label className="px-1 pt-2 pb-3">
          Question<span className={'text-scarlet-500'}>*</span>
        </label>

        <ExpandingInput
          placeholder="e.g. What book should I read next?"
          maxLength={MAX_QUESTION_LENGTH}
          value={question}
          onChange={(e) => setQuestion(e.target.value || '')}
        />
      </Col>

      <Col className="w-full">
        <label className="px-1 pt-2 pb-3">Description</label>

        <ExpandingInput
          placeholder="e.g. I enjoy Sci-Fi and Fantasy books, and recently read Dune."
          rows={2}
          maxLength={MAX_DESCRIPTION_LENGTH}
          value={description}
          onChange={(e) => setDescription(e.target.value || '')}
        />
      </Col>

      <Col className="w-full">
        <label className="px-1 pt-2 pb-3">
          Bounty (paid now)<span className={'text-scarlet-500'}>*</span>
        </label>
        <AmountInput
          label={ENV_CONFIG.moneyMoniker}
          amount={bounty}
          onChange={setBounty}
          disabled={isSubmitting}
          error={
            bounty !== undefined && bounty < 10
              ? 'Minimum bounty is 10'
              : undefined
          }
        />
      </Col>

      <Button
        className="mt-4 w-full"
        type="submit"
        color="indigo"
        size="xl"
        loading={isSubmitting}
        disabled={!isValid}
        onClick={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        {isSubmitting ? 'Creating...' : 'Create question'}
      </Button>
    </Col>
  )
}
