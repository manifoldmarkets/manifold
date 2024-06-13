import { SupabaseDirectClient } from 'shared/supabase/init'
import { convertAnswer } from 'common/supabase/contracts'
import { groupBy } from 'lodash'
import { Answer } from 'common/answer'
import { bulkInsert, updateData, insert, DataUpdate } from './utils'
import { randomString } from 'common/util/random'
import { removeUndefinedProps } from 'common/util/object'
import { millisToTs } from 'common/supabase/utils'
import {
  broadcastNewAnswer,
  broadcastUpdatedAnswer,
} from 'shared/websockets/helpers'

export const getAnswer = async (pg: SupabaseDirectClient, id: string) => {
  const row = await pg.oneOrNone(`select * from answers where id = $1`, [id])
  return row ? convertAnswer(row) : null
}

export const getAnswersForContractsDirect = async (
  pg: SupabaseDirectClient,
  contractIds: string[]
) => {
  if (contractIds.length === 0) {
    return {}
  }
  return groupBy(
    await pg.map(
      `select * from answers
    where contract_id in ($1:list)`,
      [contractIds],
      (r) => convertAnswer(r)
    ),
    'contractId'
  )
}

export const getAnswersForContract = async (
  pg: SupabaseDirectClient,
  contractId: string
) => {
  return await pg.map(
    `select * from answers where contract_id = $1`,
    [contractId],
    convertAnswer
  )
}

export const insertAnswer = async (
  pg: SupabaseDirectClient,
  ans: Omit<Answer, 'id'>
) => {
  const row = await insert(pg, 'answers', answerToRow(ans))
  broadcastNewAnswer(convertAnswer(row))
}

export const bulkInsertAnswers = async (
  pg: SupabaseDirectClient,
  answers: Omit<Answer, 'id'>[]
) => {
  if (answers.length > 0) {
    const rows = await bulkInsert(pg, 'answers', answers.map(answerToRow))
    rows.map(convertAnswer).forEach(broadcastNewAnswer)
  }
}

export const updateAnswer = async (
  pg: SupabaseDirectClient,
  id: string,
  update: DataUpdate<'answers'>
) => {
  const row = await updateData(pg, 'answers', 'id', { ...update, id })
  const answer = convertAnswer(row)
  broadcastUpdatedAnswer(answer)
  return answer
}

export const answerToRow = (answer: Omit<Answer, 'id'> & { id?: string }) => ({
  id: 'id' in answer ? answer.id : randomString(),
  index: answer.index,
  contract_id: answer.contractId,
  user_id: answer.userId,
  text: answer.text,
  pool_yes: answer.poolYes,
  pool_no: answer.poolNo,
  prob: answer.prob,
  created_time: answer.createdTime ? millisToTs(answer.createdTime) : undefined,
  data: JSON.stringify(removeUndefinedProps(answer)) + '::jsonb',
})
