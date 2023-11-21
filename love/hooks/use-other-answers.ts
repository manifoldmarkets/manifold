import { User } from 'common/user'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { useEffect } from 'react'
import { getOtherAnswers } from 'love/lib/supabase/answers'

export type OtherAnswersType = {
  question_id: number
  created_time: number
  free_response: string
  multiple_choice: number
  integer: number
  age: number
  gender: string
  city: string
  data: User
}

export const useOtherAnswers = (question_id: number) => {
  const [otherAnswers, setOtherAnswers] = usePersistentInMemoryState<
    OtherAnswersType[] | null | undefined
  >(undefined, 'other_answer_' + question_id)

  useEffect(() => {
    getOtherAnswers(question_id).then((data) => {
      setOtherAnswers(data)
    })
  }, [question_id])

  return otherAnswers
}
