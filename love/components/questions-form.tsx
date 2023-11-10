import { Title } from 'web/components/widgets/title'
import { Col } from 'web/components/layout/col'
import { Row as rowFor, run } from 'common/supabase/utils'
import { useQuestions } from 'love/hooks/use-questions'
import { useEffect, useState } from 'react'
import { useUser } from 'web/hooks/use-user'
import { db } from 'web/lib/supabase/db'
import { User } from 'common/user'
import { Input } from 'web/components/widgets/input'
import { RadioToggleGroup } from 'web/components/widgets/radio-toggle-group'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { ExpandingInput } from 'web/components/widgets/expanding-input'
import { useRouter } from 'next/router'
import { Row } from 'web/components/layout/row'
import { Button } from 'web/components/buttons/button'
import { track } from 'web/lib/service/analytics'

export type QuestionType = 'multiple_choice' | 'free_response'

export const QuestionsForm = (props: { questionType: QuestionType }) => {
  const { questionType } = props
  const questions = useQuestions()
  const user = useUser()
  const router = useRouter()
  return (
    <Col className={'w-full items-center'}>
      <Col
        className={' bg-canvas-0 w-full max-w-2xl justify-between px-6 py-4'}
      >
        <Title>Questions</Title>
        <Col className={'gap-2'}>
          {user &&
            questions
              .filter((q) =>
                questionType !== 'multiple_choice'
                  ? q.answer_type !== 'multiple_choice'
                  : q.answer_type === 'multiple_choice'
              )
              .map((row) => <QuestionRow user={user} key={row.id} row={row} />)}
        </Col>
        <Row>
          <Col className={'mt-2 w-full'}>
            <Row className={'w-full justify-end'}>
              <Button
                color={'indigo-outline'}
                onClick={() => {
                  track(`submit love questions page ${questionType}`)
                  if (user) router.push(`/${user.username}`)
                  else router.push('/')
                }}
              >
                Save
              </Button>
            </Row>
          </Col>
        </Row>
      </Col>
    </Col>
  )
}
type loveAnswer = rowFor<'love_answers'>
type loveAnswerState = Omit<loveAnswer, 'id' | 'created_time'>

const fetchPrevious = async (
  id: number,
  userId: string,
  setForm: (
    newState:
      | loveAnswerState
      | ((prevState: loveAnswerState) => loveAnswerState)
  ) => void
) => {
  const res = await run(
    db
      .from('love_answers')
      .select('*')
      .eq('question_id', id)
      .eq('creator_id', userId)
  )
  if (res.data.length) {
    setForm(res.data[0])
  }
}

function getInitialForm(userId: string, id: number) {
  return {
    creator_id: userId,
    free_response: null,
    multiple_choice: null,
    integer: null,
    question_id: id,
  }
}

const filterKeys = (
  obj: Record<string, any>,
  predicate: (key: string, value: any) => boolean
): Record<string, any> => {
  const filteredEntries = Object.entries(obj).filter(([key, value]) =>
    predicate(key, value)
  )
  return Object.fromEntries(filteredEntries)
}

const submitAnswer = async (newForm: loveAnswerState) => {
  if (!newForm) return
  const input = {
    ...filterKeys(newForm, (key, _) => !['id', 'created_time'].includes(key)),
  }
  await run(
    db
      .from('love_answers')
      .upsert(input, { onConflict: 'question_id,creator_id' })
  )
}

const QuestionRow = (props: { row: rowFor<'love_questions'>; user: User }) => {
  const { row, user } = props
  const { question, id, answer_type, multiple_choice_options } = row
  const options = multiple_choice_options as Record<string, number>
  const [form, setForm] = usePersistentLocalState<loveAnswerState>(
    getInitialForm(user.id, id),
    `love_answer_${id}_user_${user.id}`
  )

  useEffect(() => {
    fetchPrevious(id, user.id, setForm)
  }, [row.id])

  return (
    <Col>
      <span>{question}</span>
      {answer_type === 'free_response' ? (
        <ExpandingInput
          className={'w-full max-w-xl'}
          rows={3}
          value={form.free_response ?? ''}
          onChange={(e) => setForm({ ...form, free_response: e.target.value })}
          onBlur={() => submitAnswer(form)}
        />
      ) : answer_type === 'multiple_choice' && row.multiple_choice_options ? (
        <RadioToggleGroup
          className={'w-44'}
          choicesMap={options}
          setChoice={(choice) => {
            // console.log(choice)
            const updatedForm = { ...form, multiple_choice: choice }
            setForm(updatedForm)
            submitAnswer(updatedForm)
          }}
          currentChoice={form.multiple_choice ?? -1}
        />
      ) : answer_type === 'integer' ? (
        <Input
          type={'number'}
          className={'w-20'}
          max={1000}
          min={0}
          onChange={(e) =>
            setForm({ ...form, integer: Number(e.target.value) })
          }
          value={form.integer ?? undefined}
          onBlur={() => submitAnswer(form)}
        />
      ) : null}
    </Col>
  )
}

export const IndividualQuestionRow = (props: {
  row: rowFor<'love_questions'>
  user: User
  onCancel: () => void
  onSubmit?: (form: loveAnswerState) => void
}) => {
  const { row, user, onCancel, onSubmit } = props
  const { question, id, answer_type, multiple_choice_options } = row
  const options = multiple_choice_options as Record<string, number>
  const [form, setForm] = usePersistentLocalState<loveAnswerState>(
    getInitialForm(user.id, id),
    `love_answer_${id}_user_${user.id}`
  )

  useEffect(() => {
    fetchPrevious(id, user.id, setForm)
  }, [row.id])

  return (
    <Col className="gap-4">
      {answer_type === 'free_response' ? (
        <ExpandingInput
          className={'w-full max-w-xl'}
          rows={3}
          value={form.free_response ?? ''}
          onChange={(e) => setForm({ ...form, free_response: e.target.value })}
        />
      ) : answer_type === 'multiple_choice' && row.multiple_choice_options ? (
        <RadioToggleGroup
          className={'w-44'}
          choicesMap={options}
          setChoice={(choice) => {
            setForm({ ...form, multiple_choice: choice })
          }}
          currentChoice={form.multiple_choice ?? -1}
        />
      ) : answer_type === 'integer' ? (
        <Input
          type={'number'}
          className={'w-20'}
          max={1000}
          min={0}
          onChange={(e) =>
            setForm({ ...form, integer: Number(e.target.value) })
          }
          value={form.integer ?? undefined}
        />
      ) : null}
      <Row className="w-full justify-between">
        <Button color={'gray-outline'} onClick={onCancel}>
          Cancel
        </Button>
        <Button
          color={'indigo'}
          onClick={() => {
            submitAnswer(form)
            if (onSubmit) {
              onSubmit(form)
            }
          }}
        >
          Save
        </Button>
      </Row>
    </Col>
  )
}
