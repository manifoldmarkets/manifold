export type q_and_a = {
  id: string
  user_id: string
  question: string
  description: string
  bounty: number
  created_time: Date
}

export type q_and_a_answer = {
  id: string
  q_and_a_id: string
  user_id: string
  text: string
  award: number
  created_time: Date
}

export const MAX_QA_ANSWER_LENGTH = 1000