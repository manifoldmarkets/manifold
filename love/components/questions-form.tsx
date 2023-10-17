import { Title } from 'web/components/widgets/title'
import { Col } from 'web/components/layout/col'
import { Row as rowFor, run } from 'common/supabase/utils'
import { Row } from 'web/components/layout/row'
import { useQuestions } from 'love/hooks/use-questions'
import { useEffect, useState } from 'react'
import { Pagination } from 'web/components/widgets/pagination'
import { useIsAuthorized, useUser } from 'web/hooks/use-user'
import { db } from 'web/lib/supabase/db'
import { User } from 'common/user'
import { Input } from 'web/components/widgets/input'
import { RadioToggleGroup } from 'web/components/widgets/radio-toggle-group'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { ExpandingInput } from 'web/components/widgets/expanding-input'
import clsx from 'clsx'

export const QuestionsForm = () => {
  const questions = useQuestions()
  const isAuthed = useIsAuthorized()
  const user = useUser()
  const [page, setPage] = useState(0)
  const questionsPerPage = 3
  return (
    <>
      <Title>Questions</Title>
      <Col className={'gap-8'}>
        {user &&
          isAuthed &&
          questions
            .slice(
              questionsPerPage * page,
              questionsPerPage * page + questionsPerPage
            )
            .map((row) => <QuestionRow user={user} key={row.id} row={row} />)}
        <Pagination
          page={page}
          itemsPerPage={questionsPerPage}
          totalItems={questions.length}
          setPage={setPage}
        />
      </Col>
    </>
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

  const submitAnswer = async () => {
    if (!form) return
    await run(
      db
        .from('love_answers')
        .upsert([{ ...form }], { onConflict: 'question_id,creator_id' })
    )
  }
  return (
    <Row className={'p-2'}>
      <Col
        className={clsx(
          'gap-2',
          answer_type === 'free_response' ? 'w-full max-w-xl' : ''
        )}
      >
        <span>{question}</span>
        {answer_type === 'free_response' ? (
          <ExpandingInput
            className={'w-full'}
            rows={3}
            value={form.free_response ?? ''}
            onChange={(e) =>
              setForm({ ...form, free_response: e.target.value })
            }
            onBlur={submitAnswer}
          />
        ) : answer_type === 'multiple_choice' && row.multiple_choice_options ? (
          <RadioToggleGroup
            className={'w-44'}
            choicesMap={options}
            setChoice={(choice) => {
              setForm({ ...form, multiple_choice: choice })
              submitAnswer()
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
            onBlur={submitAnswer}
          />
        ) : null}
      </Col>
    </Row>
  )
}
