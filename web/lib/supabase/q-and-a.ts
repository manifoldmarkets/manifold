import { useEffect } from 'react'

import { q_and_a, q_and_a_answer } from 'common/q-and-a'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { db } from 'web/lib/supabase/db'
import { sum } from 'lodash'

export const getQuestionsAnswers = async () => {
  const [questions, answers] = await Promise.all([
    db.from('q_and_a').select('*'),
    db.from('q_and_a_answers').select('*'),
  ])

  return {
    questions: (questions.data ?? []).map((q) => ({
      ...q,
      bounty: +q.bounty,
      created_time: new Date(q.created_time).getTime(),
    })),
    answers: (answers.data ?? []).map((a) => ({
      ...a,
      award: +a.award,
      created_time: new Date(a.created_time).getTime(),
    })),
  }
}

export const useQAndA = () => {
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

export const getBountyRemaining = async (questionId: string) => {
  const { data: question } = await db
    .from('q_and_a')
    .select('bounty')
    .eq('id', questionId)
    .single()
  const { data: answers } = await db
    .from('q_and_a_answers')
    .select('*')
    .eq('q_and_a_id', questionId)
  const bounty = question?.bounty ?? 0
  const awardTotal = sum(answers?.map((a) => a.award))
  return bounty - awardTotal
}

export const useBountyRemaining = (questionId: string) => {
  const [remaining, setRemaining] = usePersistentInMemoryState<
    number | undefined
  >(undefined, `q-and-a-bounty-remaining-${questionId}`)

  useEffect(() => {
    getBountyRemaining(questionId).then((bounty) => setRemaining(bounty))
  }, [questionId])

  return remaining
}
