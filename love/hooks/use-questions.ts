import { useEffect, useState } from 'react'
import { Row } from 'common/supabase/utils'
import {
  getAllQuestions,
  getFreeResponseQuestions,
  getQuestionsWithAnswerCount,
  getUserAnswers,
  getUserCompatibilityAnswers,
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

export const useUserAnswers = (userId: string | undefined) => {
  const [answers, setAnswers] = usePersistentInMemoryState<
    Row<'love_answers'>[]
  >([], `answers-${userId}`)

  useEffect(() => {
    if (userId) {
      getUserAnswers(userId).then(setAnswers)
    }
  }, [userId])

  async function refreshAnswers() {
    if (!userId) return
    getUserAnswers(userId).then(setAnswers)
  }

  return { refreshAnswers, answers }
}

export const useUserCompatibilityAnswers = (userId: string | undefined) => {
  const [compatibilityAnswers, setCompatibilityAnswers] =
    usePersistentInMemoryState<Row<'love_compatibility_answers'>[]>(
      [],
      `compatiblity-answers-${userId}`
    )

  useEffect(() => {
    if (userId) {
      getUserCompatibilityAnswers(userId).then(setCompatibilityAnswers)
    }
  }, [userId])

  async function refreshCompatibilityAnswers() {
    if (!userId) return
    getUserCompatibilityAnswers(userId).then(setCompatibilityAnswers)
  }

  return { refreshCompatibilityAnswers, compatibilityAnswers }
}

export type QuestionWithCountType = Row<'love_questions'> & {
  answer_count: number
}

export const useQuestionsWithAnswerCount = () => {
  const [questionsWithCount, setQuestionsWithCount] =
    usePersistentInMemoryState<any>([], `questions-with-count`)

  useEffect(() => {
    getQuestionsWithAnswerCount().then((questions) => {
      setQuestionsWithCount(questions)
    })
  }, [])

  async function refreshQuestions() {
    getQuestionsWithAnswerCount().then((questions) => {
      setQuestionsWithCount(questions)
    })
  }

  return {
    refreshQuestions,
    questionsWithCount: questionsWithCount as QuestionWithCountType[],
  }
}
