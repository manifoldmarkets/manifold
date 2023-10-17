import { useEffect, useState } from 'react'
import { Row } from 'common/supabase/utils'
import {
  getAllQuestions,
  getUserAnswersAndQuestions,
} from 'love/lib/supabase/questions'

export const useQuestions = () => {
  const [questions, setQuestions] = useState<Row<'love_questions'>[]>([])
  useEffect(() => {
    getAllQuestions().then(setQuestions)
  }, [])
  return questions
}
export const useUserAnswersAndQuestions = (userId: string) => {
  const [answers, setAnswers] = useState<Row<'love_answers'>[]>([])
  const [questions, setQuestions] = useState<Row<'love_questions'>[]>([])
  useEffect(() => {
    getUserAnswersAndQuestions(userId).then(({ answers, questions }) => {
      setAnswers(answers)
      setQuestions(questions)
    })
  }, [userId])
  return { answers, questions }
}
