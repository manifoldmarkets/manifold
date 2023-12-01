import clsx from 'clsx'
import { Row as rowFor, run } from 'common/supabase/utils'
import { User } from 'common/user'
import { useQuestions } from 'love/hooks/use-questions'
import { useRouter } from 'next/router'
import { useEffect } from 'react'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { ExpandingInput } from 'web/components/widgets/expanding-input'
import { Input } from 'web/components/widgets/input'
import { RadioToggleGroup } from 'web/components/widgets/radio-toggle-group'
import { Title } from 'web/components/widgets/title'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { useUser } from 'web/hooks/use-user'
import { track } from 'web/lib/service/analytics'
import { db } from 'web/lib/supabase/db'

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
export type loveAnswerState = Omit<loveAnswer, 'id' | 'created_time'>

const fetchPrevious = async (id: number, userId: string) => {
  const res = await run(
    db
      .from('love_answers')
      .select('*')
      .eq('question_id', id)
      .eq('creator_id', userId)
  )
  if (res.data.length) {
    return res.data[0]
  }
  return null
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

export const filterKeys = (
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
  } as loveAnswerState
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
    fetchPrevious(id, user.id).then((res) => {
      if (res) {
        setForm(res)
      }
    })
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
  initialAnswer?: rowFor<'love_answers'>
  user: User
  onCancel: () => void
  onSubmit?: () => void
  className?: string
}) => {
  const { row, user, onCancel, onSubmit, initialAnswer, className } = props
  const { id, answer_type, multiple_choice_options } = row
  const options = multiple_choice_options as Record<string, number>
  const [form, setForm] = usePersistentLocalState<loveAnswerState>(
    initialAnswer ?? getInitialForm(user.id, id),
    `love_answer_${id}_user_${user.id}`
  )

  useEffect(() => {
    fetchPrevious(id, user.id).then((res) => {
      if (res) {
        setForm(res)
      }
    })
  }, [row.id])

  return (
    <Col className={clsx('gap-4', className)}>
      {answer_type === 'free_response' ? (
        <ExpandingInput
          className={'w-full'}
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
            submitAnswer(form).then(() => {
              if (onSubmit) {
                onSubmit()
              }
            })
          }}
        >
          Save
        </Button>
      </Row>
    </Col>
  )
}
