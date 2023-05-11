import { useEffect } from 'react'

import { q_and_a, q_and_a_answer } from 'common/q-and-a'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { db } from 'web/lib/supabase/db'
import { sum } from 'lodash'
import { useSupabasePolling } from 'web/hooks/use-supabase'

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
  const [questionsData] = useSupabasePolling(
    db.from('q_and_a').select('*').order('created_time', {
      ascending: false,
    }),
    {
      deps: [],
      ms: 1000 * 2,
    }
  )
  const [answersData] = useSupabasePolling(
    db.from('q_and_a_answers').select('*').order('created_time', {
      ascending: false,
    }),
    {
      deps: [],
      ms: 1000 * 2,
    }
  )

  const questions: q_and_a[] = (questionsData?.data ?? []).map((q) => ({
    ...q,
    bounty: +q.bounty,
    created_time: new Date(q.created_time).getTime(),
  }))
  const answers: q_and_a_answer[] = (answersData?.data ?? []).map((a) => ({
    ...a,
    amount: +a.amount,
    created_time: new Date(a.created_time).getTime(),
  }))

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
