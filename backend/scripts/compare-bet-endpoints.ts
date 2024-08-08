import { runScript } from './run-script'
import { log } from 'shared/utils'
import { Contract, MultiContract } from 'common/contract'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { getTestUsers } from 'shared/test/users'
import { getRandomTestBet } from 'shared/test/bets'
import { ValidatedAPIParams } from 'common/api/schema'
import { ContractMetric } from 'common/contract-metric'
import { convertContract } from 'common/supabase/contracts'
import { floatingEqual } from 'common/util/math'
import { APIError } from 'common/api/utils'
import { DEV_CONFIG } from 'common/envs/dev'

const ENDPOINT_1 = 'bet'
const ENDPOINT_2 = 'bet-batched'

const API_URL = `https://${DEV_CONFIG.apiEndpoint}/v0`
// const API_URL = `http://localhost:8088/v0`

const BETS_PER_USER_PER_MARKET = 10
const NUM_USERS = 20
// total bets will be: 4 markets x bets per user x num users
const ENABLE_LIMIT_ORDERS = true

async function createTestMarkets(pg: SupabaseDirectClient, apiKey: string) {
  const binaryMarketProps = {
    outcomeType: 'BINARY',
    initialProb: 50,
  } as const

  const multiChoiceMarketProps = {
    outcomeType: 'MULTIPLE_CHOICE',
    answers: Array(50)
      .fill(0)
      .map((_, i) => 'answer ' + i),
    shouldAnswersSumToOne: true,
    addAnswersMode: 'DISABLED',
  } as const

  return await createMarkets(
    [
      {
        ...binaryMarketProps,
        question: 'binary test ' + Math.random().toString(36).substring(7),
      },
      {
        ...binaryMarketProps,
        question: 'binary test ' + Math.random().toString(36).substring(7),
      },
      {
        ...multiChoiceMarketProps,
        question:
          'multi-choice test ' + Math.random().toString(36).substring(7),
      },
      {
        ...multiChoiceMarketProps,
        question:
          'multi-choice test ' + Math.random().toString(36).substring(7),
      },
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
  const json = await response.json()
  if (!response.ok) {
    throw new APIError(response.status as any, json?.message, json?.details)
  }

  return json
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

  return (await response.json()) as ContractMetric[]
}

async function comparePositions(market1: Contract, market2: Contract) {
  const positions1 = await getMarketPositions(market1.id)
  const positions2 = await getMarketPositions(market2.id)

  const posMap1 = new Map(positions1.map((p) => [p.userId, p]))
  const posMap2 = new Map(positions2.map((p) => [p.userId, p]))

  for (const [userId, pos1] of posMap1) {
    const pos2 = posMap2.get(userId)
    if (!pos2) {
      log(`Position for user ${userId} not found in market ${market2.id}`)
      return false
    }
    const unequalShares = Object.keys(pos1.totalShares).filter(
      (key) =>
        // I shrank epsilon here bc we lowered the number of arbitrage runs recently to speed up sums-to-one bets
        !floatingEqual(pos1.totalShares[key], pos2.totalShares[key], 0.001)
    )
    if (
      !floatingEqual(pos1.invested, pos2.invested) ||
      unequalShares.length > 0
    ) {
      log(
        `Mismatch for user ${userId} in twin markets ${market1.id} and ${market2.id}`
      )
      if (unequalShares.length > 0) {
        unequalShares.forEach((key) => {
          log(`Unequal position for ${key}:`)
          log(`Market ${pos1.contractId}: ${pos1.totalShares[key]}`)
          log(`Market ${pos2.contractId}: ${pos2.totalShares[key]}`)
        })
      }
      log(`Market ${pos1.contractId}: invested: ${pos1.invested}`)
      log(`Market ${pos2.contractId}: invested: ${pos2.invested}`)
      return false
    }
  }

  return true
}

if (require.main === module) {
  runScript(async ({ pg, firestore }) => {
    const users = await getTestUsers(firestore, pg, NUM_USERS)
    const markets = await createTestMarkets(pg, users[0].apiKey)

    log('Created test markets and users')

    const binaryMarkets = [markets[0], markets[1]]
    const multiChoiceMarkets = [markets[2], markets[3]] as MultiContract[]

    const startTime = Date.now()
    let totalAttempts = 0
    let successfulBets = 0
    log('Placing bets...')

    let shouldQuit = 0
    process.on('SIGINT', () => {
      if (shouldQuit > 1) {
        log('Exiting early without final position comparison')
        process.exit(0)
      }
      shouldQuit++
      log('Letting final bet pairs run and doing position comparison...')
    })

    for (const user of users) {
      if (shouldQuit > 0) break
      for (let i = 0; i < BETS_PER_USER_PER_MARKET; i++) {
        const binaryBet = getRandomTestBet(
          binaryMarkets[0],
          ENABLE_LIMIT_ORDERS,
          0.5
        )
        const binaryBet2 = {
          ...binaryBet,
          contractId: binaryMarkets[1].id,
        }
        const multiChoiceBet = getRandomTestBet(
          multiChoiceMarkets[0],
          ENABLE_LIMIT_ORDERS,
          // Smaller to avoid betting must be between 1-99% error
          0.05
        )
        const answerIndex = multiChoiceMarkets[0].answers.findIndex(
          (a) => a.id === multiChoiceBet.answerId
        )
        const multiChoiceBet2 = {
          ...multiChoiceBet,
          contractId: multiChoiceMarkets[1].id,
          answerId: multiChoiceMarkets[1].answers[answerIndex].id,
        }

        const bothBets = [
          [
            { endpoint: ENDPOINT_1, bet: binaryBet },
            { endpoint: ENDPOINT_2, bet: binaryBet2 },
          ],
          [
            { endpoint: ENDPOINT_1, bet: multiChoiceBet },
            { endpoint: ENDPOINT_2, bet: multiChoiceBet2 },
          ],
        ]

        await Promise.all(
          bothBets.map(async (bets) => {
            let skipBetPair = false
            for (const { endpoint, bet } of bets) {
              if (skipBetPair) break
              let betPlaced = false
              let attempts = 0
              while (!betPlaced) {
                attempts++
                totalAttempts++
                try {
                  await placeBet(endpoint, bet, user.apiKey)
                  betPlaced = true
                  successfulBets++
                } catch (error: any) {
                  if (
                    error.message.includes('Betting allowed only between 1-99%')
                  ) {
                    log(`Skipping bet pair due to 1-99% limit `)
                    skipBetPair = true
                    break
                  }
                  log(`Bet failed (attempt ${attempts}): ${error.message}`)
                  if (attempts % 5 === 0) {
                    log(`Continuing to retry for bet: ${JSON.stringify(bet)}`)
                    if (shouldQuit > 0) {
                      log(
                        'Exiting early from error, positions likely will not match'
                      )
                      break
                    }
                  }
                }
              }
            }
            if (successfulBets % 8 === 0) {
              const currentTime = Date.now()
              const elapsedTime = (currentTime - startTime) / 1000
              log(
                `In ${elapsedTime.toFixed(2)} seconds:
                  ${successfulBets} successful bets,
                  ${totalAttempts} total attempts`
              )
            }
          })
        )
      }
    }

    const endTime = Date.now()
    const totalBets = successfulBets
    const duration = (endTime - startTime) / 1000
    const betsPerSecond = totalBets / duration

    log(`Placed ${totalBets} bets in ${duration.toFixed(2)} seconds`)
    log(`Total attempts: ${totalAttempts}`)
    log(`Performance: ${betsPerSecond.toFixed(2)} bets per second`)

    // wait seconds for final bets to settle
    await new Promise((resolve) => setTimeout(resolve, 1000))
    const binaryPositionsMatch = await comparePositions(
      binaryMarkets[0],
      binaryMarkets[1]
    )
    const multiChoicePositionsMatch = await comparePositions(
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
