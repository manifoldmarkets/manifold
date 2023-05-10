import { useEffect } from 'react'

import { q_and_a, q_and_a_answer } from 'common/q-and-a'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { db } from 'web/lib/supabase/db'

export const getQuestionsAnswers = async () => {
  const [questions, answers] = await Promise.all([
    db.from('q_and_a').select('*'),
    db.from('q_and_a_answers').select('*'),
  ])

  return {
    questions: questions.data ?? [],
    answers: answers.data ?? [],
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
