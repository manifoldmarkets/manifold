import { FullQuestion } from 'common/api-question-types'
import { ContractMetrics } from 'common/calculate-metrics'
import { config } from 'discord-bot/constants/config'
import { User } from 'discord.js'

export type Api = {
  apiKey: string
  discordUser: User
  manifoldUserId: string
}

export const getQuestionFromSlug = async (slug: string) => {
  const resp = await fetch(`${config.domain}api/v0/slug/${slug}`)
  if (!resp.ok) {
    throw new Error('Question not found with slug: ' + slug)
  }
  return (await resp.json()) as FullQuestion
}
export const getQuestionFromId = async (id: string) => {
  const resp = await fetch(`${config.domain}api/v0/question/${id}`).catch(
    (e) => {
      console.error('Error on getQuestionFromId', e)
      throw e
    }
  )
  if (!resp.ok) {
    throw new Error('Question not found with id: ' + id)
  }
  return (await resp.json()) as FullQuestion
}
export const getOpenBinaryQuestionFromSlug = async (slug: string) => {
  const question = await getQuestionFromSlug(slug)

  if (question.isResolved || (question.closeTime ?? 0) < Date.now()) {
    const status = question.isResolved ? 'resolved' : 'closed'
    throw new Error(`Question is ${status}, no longer accepting bets`)
  }
  if (question.outcomeType !== 'BINARY') {
    throw new Error('Only Yes/No questions are supported')
  }
  return question
}
export const getTopAndBottomPositions = async (
  slug: string,
  orderBy: 'profit' | 'shares'
) => {
  const question = await getQuestionFromSlug(slug)
  const NUM_POSITIONS = 5
  const resp = await fetch(
    `${config.domain}api/v0/question/${question.id}/positions?top=${NUM_POSITIONS}&bottom=${NUM_POSITIONS}&order=${orderBy}`
  )
  if (!resp.ok) {
    throw new Error('Positions not found with slug: ' + slug)
  }
  const contractMetrics = (await resp.json()) as ContractMetrics[]
  return { question, contractMetrics }
}

export const placeBet = async (
  api: Api,
  questionId: string,
  amount: number,
  outcome: 'YES' | 'NO'
) => {
  return await fetch(`${config.domain}api/v0/bet`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${api.apiKey}`,
    },
    body: JSON.stringify({
      amount,
      contractId: questionId,
      outcome,
    }),
  })
}

export const getMyPositionInQuestion = async (api: Api, questionId: string) => {
  const resp = await fetch(
    `${config.domain}api/v0/question/${questionId}/positions?userId=${api.manifoldUserId}`
  )
  if (!resp.ok) {
    throw new Error('Position not found with question id: ' + questionId)
  }
  return (await resp.json()) as ContractMetrics[]
}

export const createQuestion = async (
  api: Api,
  question: string,
  description: string
) => {
  return await fetch(`${config.domain}api/v0/question`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${api.apiKey}`,
    },
    body: JSON.stringify({
      question,
      description,
      initialProb: 50,
      outcomeType: 'BINARY',
    }),
  })
}
