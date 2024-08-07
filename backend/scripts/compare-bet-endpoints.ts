import { runScript } from './run-script'
import { log } from 'shared/utils'
import { Contract } from 'common/contract'
import { SupabaseDirectClient } from 'shared/supabase/init'
import {
  getRandomTestBet,
  getTestUsersForBetting,
} from 'shared/test/test-users'
import { ValidatedAPIParams } from 'common/api/schema'
import { ContractMetric } from 'common/contract-metric'
import { convertContract } from 'common/supabase/contracts'

// const API_URL = `https://${DEV_CONFIG.apiEndpoint}/v0`
const API_URL = `http://localhost:8088/v0`
const BETS_PER_USER = 10

async function createTestMarkets(pg: SupabaseDirectClient, apiKey: string) {
  const binaryMarketProps = {
    question: 'binary test ' + Math.random().toString(36).substring(7),
    outcomeType: 'BINARY',
    initialProb: 50,
  } as const

  const multiChoiceMarketProps = {
    question:
      'sums-to-one multi-choice test ' +
      Math.random().toString(36).substring(7),
    outcomeType: 'MULTIPLE_CHOICE',
    answers: Array(50)
      .fill(0)
      .map((_, i) => 'answer ' + i),
    shouldAnswersSumToOne: true,
    addAnswersMode: 'DISABLED',
  } as const

  return await createMarkets(
    [
      binaryMarketProps,
      binaryMarketProps,
      multiChoiceMarketProps,
      multiChoiceMarketProps,
    ],
    apiKey,
    pg
  )
}

async function placeBet(
  endpoint: string,
  bet: ValidatedAPIParams<'bet'>,
  apiKey: string
) {
  const response = await fetch(`${API_URL}/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${apiKey}`,
    },
    body: JSON.stringify(bet),
  })

  if (!response.ok) {
    throw new Error(`Failed to place bet: ${await response.text()}`)
  }

  return await response.json()
}

const createMarkets = async (
  marketProps: ValidatedAPIParams<'market'>[],
  apiKey: string,
  pg: SupabaseDirectClient
) => {
  const markets = await Promise.all(
    marketProps.map(async (market) => {
      const resp = await fetch(API_URL + `/market`, {
        method: 'POST',
        headers: {
          Authorization: `Key ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(market),
      })
      if (resp.status !== 200) {
        console.error('Failed to create market', await resp.text())
      }
      return resp.json()
    })
  )
  return await pg.map(
    `select * from contracts where slug in ($1:list)`,
    [markets.map((m: any) => m.slug)],
    convertContract
  )
}

async function getMarketPositions(contractId: string) {
  const response = await fetch(`${API_URL}/market/${contractId}/positions`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to get market positions: ${await response.text()}`)
  }

  return (await response.json()) as ContractMetric[]
}

async function comparePositions(
  pg: SupabaseDirectClient,
  market1: Contract,
  market2: Contract
) {
  const positions1 = await getMarketPositions(market1.id)
  const positions2 = await getMarketPositions(market2.id)

  const posMap1 = new Map(positions1.map((p) => [p.userId, p]))
  const posMap2 = new Map(positions2.map((p) => [p.userId, p]))

  for (const [userId, pos1] of posMap1) {
    const pos2 = posMap2.get(userId)
    if (
      !pos2 ||
      pos1.payout !== pos2.payout ||
      pos1.totalShares !== pos2.totalShares
    ) {
      log(
        `Mismatch for user ${userId} in markets ${market1.id} and ${market2.id}`
      )
      log(`Market 1: ${JSON.stringify(pos1)}`)
      log(`Market 2: ${JSON.stringify(pos2)}`)
      return false
    }
  }

  return true
}

if (require.main === module) {
  runScript(async ({ pg }) => {
    const users = await getTestUsersForBetting(pg)
    const markets = await createTestMarkets(pg, users[0].apiKey)

    log('Created test markets and users')

    const binaryMarkets = [markets[0], markets[1]]
    const multiChoiceMarkets = [markets[2], markets[3]]

    const startTime = Date.now()

    for (const user of users) {
      for (let i = 0; i < BETS_PER_USER; i++) {
        const binaryBet = getRandomTestBet(binaryMarkets[0], true)
        const binaryBet2 = {
          ...binaryBet,
          contractId: binaryMarkets[1].id,
        }
        const multiChoiceBet = getRandomTestBet(multiChoiceMarkets[0], true)
        const multiChoiceBet2 = {
          ...multiChoiceBet,
          contractId: multiChoiceMarkets[1].id,
        }

        await Promise.all([
          placeBet('bet', binaryBet, user.apiKey),
          placeBet('bet-batched', binaryBet2, user.apiKey),
          placeBet('bet', multiChoiceBet, user.apiKey),
          placeBet('bet-batched', multiChoiceBet2, user.apiKey),
        ])
      }
    }

    const endTime = Date.now()
    const totalBets = users.length * BETS_PER_USER * 4
    const duration = (endTime - startTime) / 1000
    const betsPerSecond = totalBets / duration

    log(`Placed ${totalBets} bets in ${duration.toFixed(2)} seconds`)
    log(`Performance: ${betsPerSecond.toFixed(2)} bets per second`)

    const binaryPositionsMatch = await comparePositions(
      pg,
      binaryMarkets[0],
      binaryMarkets[1]
    )
    const multiChoicePositionsMatch = await comparePositions(
      pg,
      multiChoiceMarkets[0],
      multiChoiceMarkets[1]
    )

    log(`Binary market positions match: ${binaryPositionsMatch}`)
    log(`Multi-choice market positions match: ${multiChoicePositionsMatch}`)

    if (binaryPositionsMatch && multiChoicePositionsMatch) {
      log('All positions match between market pairs')
    } else {
      log('Position mismatch detected')
    }
  })
}
