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

export const QuestionsForm = () => {
  const questions = useQuestions()
  const user = useUser()
  const [page, setPage] = useState(0)
  const router = useRouter()
  useEffect(() => {
    scrollTo(0, 0)
  }, [page])
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
                page === 0
                  ? q.answer_type === 'multiple_choice'
                  : page === 1 && q.answer_type !== 'multiple_choice'
              )
              .map((row) => <QuestionRow user={user} key={row.id} row={row} />)}
        </Col>
        <Row>
          <Col className={'mt-2 w-full'}>
            <Row className={'justify-between'}>
              <Button
                color={'gray-white'}
                className={page === 0 ? 'invisible' : ''}
                onClick={() => {
                  setPage(page - 1)
                }}
              >
                Back
              </Button>
              <Button
                color={'indigo-outline'}
                onClick={() => {
                  page === 0 ? setPage(1) : router.push('/')
                }}
              >
                Save & continue
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
const QuestionRow = (props: { row: rowFor<'love_questions'>; user: User }) => {
  const { row, user } = props
  const { question, id, answer_type, multiple_choice_options } = row
  const options = multiple_choice_options as Record<string, number>
  const [form, setForm] = usePersistentLocalState<loveAnswerState>(
    {
      creator_id: user.id,
      free_response: null,
      multiple_choice: null,
      integer: null,
      question_id: id,
    },
    `love_answer_${id}_user_${user.id}`
  )

  const fetchPrevious = async () => {
    const res = await run(
      db
        .from('love_answers')
        .select('*')
        .eq('question_id', id)
        .eq('creator_id', user.id)
    )
    if (res.data.length) {
      setForm(res.data[0])
    }
  }
  useEffect(() => {
    fetchPrevious()
  }, [row.id])

  const filterKeys = (
    obj: Record<string, any>,
    predicate: (key: string, value: any) => boolean
  ): Record<string, any> => {
    const filteredEntries = Object.entries(obj).filter(([key, value]) =>
      predicate(key, value)
    )
    return Object.fromEntries(filteredEntries)
  }

  const submitAnswer = async (currentForm?: loveAnswerState) => {
    const updatedForm = currentForm ?? form
    if (!updatedForm) return
    const input = {
      ...filterKeys(
        updatedForm,
        (key, _) => !['id', 'created_time'].includes(key)
      ),
    }
    await run(
      db
        .from('love_answers')
        .upsert(input, { onConflict: 'question_id,creator_id' })
    )
  }

  return (
    <Col className={'w-full gap-2 sm:px-4'}>
      <span>{question}</span>
      {answer_type === 'free_response' ? (
        <ExpandingInput
          className={'w-full max-w-xl'}
          rows={3}
          value={form.free_response ?? ''}
          onChange={(e) => setForm({ ...form, free_response: e.target.value })}
          onBlur={() => submitAnswer()}
        />
      ) : answer_type === 'multiple_choice' && row.multiple_choice_options ? (
        <RadioToggleGroup
          className={'w-44'}
          choicesMap={options}
          setChoice={(choice) => {
            console.log(choice)
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
          onBlur={() => submitAnswer()}
        />
      ) : null}
    </Col>
  )
}
