import { FullMarket } from 'common/api/market-types'
import { ContractMetrics } from 'common/calculate-metrics'
import { config } from 'discord-bot/constants/config'
import { User } from 'discord.js'

export type Api = {
  apiKey: string
  discordUser: User
  manifoldUserId: string
}

export const getMarketFromSlug = async (slug: string) => {
  const resp = await fetch(`${config.domain}api/v0/slug/${slug}`)
  if (!resp.ok) {
    throw new Error('Market not found with slug: ' + slug)
  }
  return (await resp.json()) as FullMarket
}
export const getMarketFromId = async (id: string) => {
  const resp = await fetch(`${config.domain}api/v0/market/${id}`).catch((e) => {
    console.error('Error on getMarketFromId', e)
    throw e
  })
  if (!resp.ok) {
    throw new Error('Market not found with id: ' + id)
  }
  return (await resp.json()) as FullMarket
}
export const getOpenBinaryMarketFromSlug = async (slug: string) => {
  const market = await getMarketFromSlug(slug)

  if (market.isResolved || (market.closeTime ?? 0) < Date.now()) {
    const status = market.isResolved ? 'resolved' : 'closed'
    throw new Error(`Market is ${status}, no longer accepting bets`)
  }
  if (market.outcomeType !== 'BINARY') {
    throw new Error('Only Yes/No markets are supported')
  }
  return market
}
export const getTopAndBottomPositions = async (
  slug: string,
  orderBy: 'profit' | 'shares'
) => {
  const market = await getMarketFromSlug(slug)
  const NUM_POSITIONS = 5
  const resp = await fetch(
    `${config.domain}api/v0/market/${market.id}/positions?top=${NUM_POSITIONS}&bottom=${NUM_POSITIONS}&order=${orderBy}`
  )
  if (!resp.ok) {
    throw new Error('Positions not found with slug: ' + slug)
  }
  const contractMetrics = (await resp.json()) as ContractMetrics[]
  return { market, contractMetrics }
}

export const placeBet = async (
  api: Api,
  marketId: string,
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
      contractId: marketId,
      outcome,
    }),
  })
}

export const getMyPositionInMarket = async (api: Api, marketId: string) => {
  const resp = await fetch(
    `${config.domain}api/v0/market/${marketId}/positions?userId=${api.manifoldUserId}`
  )
  if (!resp.ok) {
    throw new Error('Position not found with market id: ' + marketId)
  }
  return (await resp.json()) as ContractMetrics[]
}

export const createMarket = async (
  api: Api,
  question: string,
  description: string
) => {
  return await fetch(`${config.domain}api/v0/market`, {
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
