export type q_and_a = {
  id: string
  user_id: string
  question: string
  description: string
  bounty: number
  deleted: boolean
  created_time: number
}

export type q_and_a_answer = {
  id: string
  q_and_a_id: string
  user_id: string
  text: string
  award: number
  deleted: boolean
  created_time: number
}

export const MAX_QA_QUESTION_LENGTH = 240
export const MAX_QA_DESCRIPTION_LENGTH = 1000
export const MAX_QA_ANSWER_LENGTH = 1000

export const MIN_BOUNTY = 10
