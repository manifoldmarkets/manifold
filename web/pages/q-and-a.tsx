import { MAX_DESCRIPTION_LENGTH, MAX_QUESTION_LENGTH } from 'common/contract'
import { ENV_CONFIG } from 'common/envs/constants'
import { MAX_QA_ANSWER_LENGTH, q_and_a, q_and_a_answer } from 'common/q-and-a'
import { formatMoney } from 'common/util/format'
import { groupBy } from 'lodash'
import { useEffect, useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { AmountInput } from 'web/components/widgets/amount-input'
import { Avatar, EmptyAvatar } from 'web/components/widgets/avatar'
import { ExpandingInput } from 'web/components/widgets/expanding-input'
import { Subtitle } from 'web/components/widgets/subtitle'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { useUserById } from 'web/hooks/use-user-supabase'
import { createQAndA, createQAndAAnswer } from 'web/lib/firebase/api'
import { db } from 'web/lib/supabase/db'

export default function QuestionAndAnswer() {
  const { questions, answers } = useQAndA()
  const answersByQuestion = groupBy(answers, 'q_and_a_id')
  return (
    <Page>
      <Col className="mx-auto w-full max-w-lg gap-4 pb-8 pt-2 sm:pt-0">
        {questions.map((q) => (
          <QuestionAnswer key={q.id} q={q} as={answersByQuestion[q.id] ?? []} />
        ))}
        <CreateQAndA />
      </Col>
    </Page>
  )
}

const getQuestionsAnswers = async () => {
  const [questions, answers] = await Promise.all([
    db.from('q_and_a').select('*'),
    db.from('q_and_a_answers').select('*'),
  ])

  return {
    questions: questions.data ?? [],
    answers: answers.data ?? [],
  }
}

const useQAndA = () => {
  const [questions, setQAndA] = usePersistentInMemoryState<q_and_a[]>(
    [],
    'q-and-a'
  )
  const [answers, setAnswers] = usePersistentInMemoryState<q_and_a_answer[]>(
    [],
    'q-and-a-answers'
  )
  useEffect(() => {
    getQuestionsAnswers().then(({ questions, answers }) => {
      setQAndA(questions)
      setAnswers(answers)
    })
  }, [])

  return { questions, answers }
}

function QuestionAnswer(props: { q: q_and_a; as: q_and_a_answer[] }) {
  const { q, as } = props
  const user = useUserById(q.user_id)
  return (
    <Col className="gap-1">
      <Col className="bg-canvas-0 px-3 py-2 shadow">
        <div>{q.question}</div>
        <div className="text-ink-700 line-clamp-1">
          {q.description}s dfasdfasdfasfa;sldkfj ;lsakjdf;l aksdjf al;skf
          jas;ldf kjas;lf kajsdf ;lkaj sd;lfkasjd f;laksjdf ;laskdf j;lasdkf
          ja;sl f
        </div>
        <Row className="mt-1 gap-2">
          {user ? (
            <Avatar
              size="xs"
              avatarUrl={user.avatarUrl}
              username={user.username}
            />
          ) : (
            <EmptyAvatar size={6} />
          )}
          <div>{formatMoney(q.bounty)} bounty</div>
        </Row>
      </Col>
      <Col className="ml-6">
        {as.map((a) => (
          <Answer key={a.id} answer={a} />
        ))}
        <CreateAnswer questionId={q.id} />
      </Col>
    </Col>
  )
}

function Answer(props: { answer: q_and_a_answer }) {
  const { answer } = props
  const user = useUserById(answer.user_id)

  return (
    <Row className="gap-2">
      {user ? (
        <Avatar size="xs" avatarUrl={user.avatarUrl} username={user.username} />
      ) : (
        <EmptyAvatar size={6} />
      )}
      <div>{answer.text}</div>
    </Row>
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
  }

  return (
    <Col className="mt-2 w-full">
      <Row className="items-end gap-2">
        <ExpandingInput
          className="flex-1 !text-sm"
          placeholder="Submit an answer"
          autoFocus
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
    setIsSubmitting(false)
  }

  return (
    <Col className="gap-4">
      <Subtitle>Create question</Subtitle>

      <Col className="w-full">
        <label className="px-1 pt-2 pb-3">
          Question<span className={'text-scarlet-500'}>*</span>
        </label>

        <ExpandingInput
          placeholder="e.g. What book should I read next?"
          autoFocus
          maxLength={MAX_QUESTION_LENGTH}
          value={question}
          onChange={(e) => setQuestion(e.target.value || '')}
        />
      </Col>

      <Col className="w-full">
        <label className="px-1 pt-2 pb-3">Description</label>

        <ExpandingInput
          placeholder="e.g. I enjoy Sci-Fi and Fantasy books, and recently read Dune."
          autoFocus
          rows={2}
          maxLength={MAX_DESCRIPTION_LENGTH}
          value={description}
          onChange={(e) => setDescription(e.target.value || '')}
        />
      </Col>

      <Col className="w-full">
        <label className="px-1 pt-2 pb-3">Bounty (paid now)</label>
        <AmountInput
          label={ENV_CONFIG.moneyMoniker}
          amount={bounty}
          onChange={setBounty}
          disabled={isSubmitting}
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
