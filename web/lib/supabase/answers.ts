import { convertAnswer } from 'common/supabase/contracts'
import { run } from 'common/supabase/utils'
import { db } from './db'

export const getAnswers = async (contractId: string) => {
  const { data } = await run(
    db.from('answers').select('*').eq('contract_id', contractId)
  )

  return data?.map(convertAnswer)
}
