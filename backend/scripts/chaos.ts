import { runScript } from './run-script'
import { isProd, log } from 'shared/utils'
import { convertContract } from 'common/supabase/contracts'
import { Contract } from 'common/contract'
import { pgp } from 'shared/supabase/init'
import { getTestUsers } from 'shared/test/users'
import { getRandomTestBet } from 'shared/test/bets'
import { MONTH_MS } from 'common/util/time'
import { LiteMarket } from 'common/api/market-types'
import { sumBy } from 'lodash'
import * as readline from 'readline'
import { DEV_CONFIG } from 'common/envs/dev'

const URL = `https://${DEV_CONFIG.apiEndpoint}/v0`
// const URL = `http://localhost:8088/v0`
const OLD_MARKET_SLUG = undefined // 'test-8yr5oj'
const USE_OLD_MARKET = !!OLD_MARKET_SLUG
const LIMIT_ORDER_RATE = 0.02
const VISIT_MARKETS = true
const USERS = 100

// TODO How many limit orders causes a lock down?

async function promptForRunInfo() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  const runName = await new Promise<string>((resolve) => {
    rl.question('What features/changes are you testing?: ', (answer) =>
      resolve(answer)
    )
  })

  const runTime = await new Promise<number | undefined>((resolve) => {
    rl.question(
      'Enter runtime in seconds (leave empty to run forever): ',
      (answer) => {
        rl.close()
        resolve(answer ? parseInt(answer) : undefined)
      }
    )
  })

  return { runName, runTime }
}

if (require.main === module) {
  runScript(async ({ pg }) => {
    if (isProd()) {
      log('This script is dangerous to run in prod. Exiting.')
      return
    }

    const { runName, runTime } = await promptForRunInfo()

    const privateUsers = await getTestUsers(pg, USERS)
    let markets: LiteMarket[] = []
    if (!USE_OLD_MARKET) {
      const marketCreations = [
        // {
        //   question: 'test ' + Math.random().toString(36).substring(7),
        //   outcomeType: 'MULTIPLE_CHOICE',
        //   answers: Array(50)
        //     .fill(0)
        //     .map((_, i) => 'answer ' + i),
        //   shouldAnswersSumToOne: true,
        // },
        {
          question: 'test ' + Math.random().toString(36).substring(7),
          outcomeType: 'BINARY',
          closeTime: Date.now() + MONTH_MS,
        },
        // {
        //   question: 'test ' + Math.random().toString(36).substring(7),
        //   outcomeType: 'MULTIPLE_CHOICE',
        //   answers: Array(50)
        //     .fill(0)
        //     .map((_, i) => 'answer ' + i),
        //   shouldAnswersSumToOne: false,
        // },
      ]
      log('creating markets')
      markets = await Promise.all(
        marketCreations.map(async (market) => {
          const resp = await fetch(URL + `/market`, {
            method: 'POST',
            headers: {
              Authorization: `Key ${privateUsers[0].apiKey}`,
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
    }
    const contracts = await pg.map(
      `select * from contracts where slug in ($1:list)`,
      USE_OLD_MARKET ? [[OLD_MARKET_SLUG]] : [markets.map((m: any) => m.slug)],
      convertContract
    )
    log(`Found ${contracts.length} contracts`)

    let totalVisits = 0
    let totalBets = 0
    let totalVisitErrors = 0
    let totalBetErrors = 0
    const startTime = Date.now()
    const userSpentAmounts: { [key: string]: number } = {}
    const errorMessage: { [key: string]: number } = {}

    const recentBetResults: { timestamp: number; success: boolean }[] = []

    const runChaos = async () => {
      log('Chaos reigns...')
      await Promise.all(
        privateUsers.map(async (user) => {
          const manyBetsPromise = async () => {
            const betCount = Math.floor(Math.random() * 10) + 1
            const contract =
              contracts[Math.floor(Math.random() * contracts.length)]
            const betResult = await placeManyBets(
              user.apiKey!,
              betCount,
              contract
            )
            totalBets += betResult.success
            totalBetErrors += betResult.failure
            userSpentAmounts[user.id] =
              (userSpentAmounts[user.id] || 0) + betResult.totalSpent
            Object.entries(betResult.errorMessage).map(([key, value]) => {
              errorMessage[key] = errorMessage[key]
                ? errorMessage[key] + value
                : value
            })

            // Add bet results to recentBetResults
            const now = Date.now()
            for (let i = 0; i < betResult.success; i++) {
              recentBetResults.push({ timestamp: now, success: true })
            }
            for (let i = 0; i < betResult.failure; i++) {
              recentBetResults.push({ timestamp: now, success: false })
            }

            // Remove bet results older than 60 seconds
            const sixtySecondsAgo = now - 60000
            while (
              recentBetResults.length > 0 &&
              recentBetResults[0].timestamp < sixtySecondsAgo
            ) {
              recentBetResults.shift()
            }
          }
          // 50 visits per user
          const visitPromises = Array(50)
            .fill(null)
            .map(() => async () => {
              const contract =
                contracts[Math.floor(Math.random() * contracts.length)]
              try {
                await visitContract(contract)
                totalVisits++
              } catch (error: any) {
                errorMessage[error.message] = errorMessage[error.message]
                  ? errorMessage[error.message] + 1
                  : 1
                totalVisitErrors++
              }
            })

          await Promise.all([
            ...(VISIT_MARKETS ? visitPromises.map((p) => p()) : []),
            manyBetsPromise(),
          ])
        })
      )
    }

    type QueueSizeResult = {
      queueSizeErrors: { [range: string]: number }
      queueSizeMessages: Set<string>
    }

    const processQueueSizeErrors = (errorMessages: {
      [key: string]: number
    }): QueueSizeResult => {
      const queueSizeErrors: { [range: string]: number } = {}
      const queueSizeMessages = new Set<string>()

      Object.entries(errorMessages).forEach(([message, count]) => {
        const match = message.match(/\((\d+) requests in queue\)/)
        if (match) {
          const queueSize = parseInt(match[1])
          let range
          if (queueSize < 100) range = '<100'
          else if (queueSize < 200) range = '100-199'
          else if (queueSize < 300) range = '200-299'
          else if (queueSize < 400) range = '300-399'
          else if (queueSize < 500) range = '400-499'
          else if (queueSize < 600) range = '500-599'
          else if (queueSize < 700) range = '600-699'
          else if (queueSize < 800) range = '700-799'
          else if (queueSize < 900) range = '800-899'
          else if (queueSize < 1000) range = '900-999'
          else range = '1000+'

          queueSizeErrors[range] = (queueSizeErrors[range] || 0) + count
          queueSizeMessages.add(message)
        }
      })

      return { queueSizeErrors, queueSizeMessages }
    }

    const reportStats = async () => {
      const totalLimitOrdersOnMarket = await pg.one(
        `select count(*) from contract_bets where contract_id in ($1:list)
        and not is_filled and not is_cancelled
        `,
        [contracts.map((c) => c.id)]
      )
      const elapsedSeconds = (Date.now() - startTime) / 1000
      const { queueSizeErrors, queueSizeMessages } =
        processQueueSizeErrors(errorMessage)

      log(`----- Stats report -----`)
      log(`----- Queue errors -----`)
      Object.entries(queueSizeErrors)
        .sort((a, b) => {
          const getMin = (range: string) =>
            parseInt(range.split('-')[0].replace(/[<+]/g, ''))
          return getMin(a[0]) - getMin(b[0])
        })
        .forEach(([range, count]) => {
          if (count > 0) {
            log(`Queue size ${range}: ${count} errors`)
          }
        })

      const otherErrors = Object.entries(errorMessage).filter(
        ([message]) => !queueSizeMessages.has(message)
      )

      if (otherErrors.length > 0) {
        log(`----- Other errors -----`)
        otherErrors.forEach(([message, count]) => {
          log(`Error seen ${count} times: ${message}`)
        })
      }
      if (VISIT_MARKETS) {
        log(`----- Visits -----`)
        log(`Total error visits: ${totalVisitErrors}`)
        log(`Total successful visits: ${totalVisits}`)
        log(
          `Successful visits per second: ${(
            totalVisits / elapsedSeconds
          ).toFixed(2)}`
        )
        log(
          'Successful visit rate: ',
          Math.round((totalVisits / (totalVisits + totalVisitErrors)) * 100) +
            '%'
        )
      }
      log(`----- Bets -----`)
      log(`Total bettors: ${privateUsers.length}`)
      log(`Limit order rate: ${LIMIT_ORDER_RATE}`)
      log(`Slug used: ${USE_OLD_MARKET ? OLD_MARKET_SLUG : markets[0].slug}`)
      log(`Total market volume at start: ${sumBy(contracts, (c) => c.volume)}`)
      log(`Total limit orders on market: ${totalLimitOrdersOnMarket.count}`)
      log(`Total error bets: ${totalBetErrors}`)
      log(`Total successful bets: ${totalBets}`)
      log(
        `Successful bets per second: ${(totalBets / elapsedSeconds).toFixed(2)}`
      )
      const totalRecentBets = recentBetResults.length
      const successfulRecentBets = recentBetResults.filter(
        (r) => r.success
      ).length
      const recentSuccessRate =
        totalRecentBets > 0 ? (successfulRecentBets / 60).toFixed(2) : '0'
      log(
        `Successful bets per second over the last minute: ${recentSuccessRate}`
      )
      log(
        'Successful bet rate: ',
        Math.round((totalBets / (totalBets + totalBetErrors)) * 100) + '%'
      )

      log(`----- Finally -----`)
      log(`Testing changes: ${runName}`)
      log(`Total time elapsed: ${elapsedSeconds.toFixed(2)} seconds`)
      log(`-------------------------`)
      if (runTime && elapsedSeconds >= runTime) {
        log(`Runtime elapsed, exiting...`)
        process.exit(0)
      }
    }

    // Run report stats and repeat chaos
    const reportInterval = setInterval(reportStats, 5000)
    const chaosInterval = setInterval(runChaos, 10000)

    // Handle script termination
    process.on('SIGINT', async () => {
      clearInterval(chaosInterval)
      clearInterval(reportInterval)
      await reportStats()
      pgp.end()
      log('Chaos no longer reigns.')
      process.exit()
    })

    // Run chaos for the first time
    await runChaos()
    // Keep the script running
    await new Promise(() => {})
  })
}

async function visitContract(contract: Contract) {
  return fetch(URL + `/market?contractId=${contract.id}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

async function placeManyBets(
  apiKey: string,
  count: number,
  contract: Contract
) {
  const betData = getRandomTestBet(contract, LIMIT_ORDER_RATE)
  let success = 0
  let failure = 0
  let totalSpent = 0
  const executionTimes: number[] = []

  const errorMessage: { [key: string]: number } = {}
  for (let i = 0; i < count; i++) {
    const start = Date.now()
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 2000))
    await fetch(URL + '/bet', {
      method: 'POST',
      headers: {
        Authorization: `Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(betData),
    })
      .then(async (resp) => {
        const end = Date.now()
        executionTimes.push(end - start)
        const json = await resp.json()
        if (resp.status === 200) {
          success++
          totalSpent += betData.amount
        } else {
          errorMessage[json.message] = errorMessage[json.message]
            ? errorMessage[json.message] + 1
            : 1
          failure++
        }
      })
      .catch((e) => {
        const end = Date.now()
        executionTimes.push(end - start)
        errorMessage[e.message] = errorMessage[e.message]
          ? errorMessage[e.message] + 1
          : 1
        failure++
      })
  }

  return { success, failure, errorMessage, totalSpent, executionTimes }
}
