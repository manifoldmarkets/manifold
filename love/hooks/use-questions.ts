import { useEffect, useState } from 'react'
import { Row, run } from 'common/supabase/utils'
import { db } from 'web/lib/supabase/db'

export const useQuestions = () => {
  const [questions, setQuestions] = useState<Row<'love_questions'>[]>([])
  useEffect(() => {
    run(
      db
        .from('love_questions')
        .select('*')
        .order('importance_score', { ascending: false })
    ).then(({ data }) => setQuestions(data as Row<'love_questions'>[]))
  }, [])
  return questions
}
