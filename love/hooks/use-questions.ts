import { useEffect, useState } from 'react'
import { Row } from 'common/supabase/utils'
import {
  getAllQuestions,
  getFreeResponseQuestions,
  getUserAnswersAndQuestions,
} from 'love/lib/supabase/questions'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'

export const useQuestions = () => {
  const [questions, setQuestions] = useState<Row<'love_questions'>[]>([])
  useEffect(() => {
    getAllQuestions().then(setQuestions)
  }, [])
  return questions
}

export const useFreeResponseQuestions = () => {
  const [questions, setQuestions] = useState<Row<'love_questions'>[]>([])
  useEffect(() => {
    getFreeResponseQuestions().then(setQuestions)
  }, [])
  return questions
}

export const useUserAnswersAndQuestions = (userId: string | undefined) => {
  const [answers, setAnswers] = usePersistentInMemoryState<
    Row<'love_answers'>[]
  >([], `answers-${userId}`)
  const [questions, setQuestions] = usePersistentInMemoryState<
    Row<'love_questions'>[]
  >([], `questions-${userId}`)
  useEffect(() => {
    if (userId) {
      getUserAnswersAndQuestions(userId).then(({ answers, questions }) => {
        setAnswers(answers)
        setQuestions(questions)
      })
    }
  }, [userId])

  async function refreshAnswersAndQuestions() {
    if (!userId) return
    getUserAnswersAndQuestions(userId).then(({ answers, questions }) => {
      setAnswers(answers)
      setQuestions(questions)
    })
  }

  return { answers, questions, refreshAnswersAndQuestions }
}
