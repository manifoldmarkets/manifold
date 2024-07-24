import { runScript } from './run-script'
import { isProd } from 'shared/utils'
import { convertContract } from 'common/supabase/contracts'
import { Contract } from 'common/contract'
import { removeUndefinedProps } from 'common/util/object'
import { incrementBalance } from 'shared/supabase/users'
import { formatApiUrlWithParams } from 'common/util/api'

import { DEV_CONFIG } from 'common/envs/dev'
const BET_URL = `https://${DEV_CONFIG.apiEndpoint}/v0/bet`
// const BET_URL = `http://localhost:8088/v0/bet`

if (require.main === module) {
  runScript(async ({ pg }) => {
    if (isProd()) {
      console.log('This script is dangerous to run in prod. Exiting.')
      return
    }
    const privateUsers = await pg.map(
      `select id, data->>'apiKey' as api_key from private_users
              where data->>'email' ilike '%manifoldtestnewuser%'
              limit 50`,
      [],
      (r) => ({ id: r.id as string, apiKey: r.api_key as string })
    )

    await Promise.all(
      privateUsers.map((pu) =>
        incrementBalance(pg, pu.id, {
          balance: 10000,
          totalDeposits: 10000,
        })
      )
    )
    await Promise.all(
      privateUsers
        .filter((p) => !p.apiKey)
        .map(async (p) => {
          return await pg.none(
            `update private_users set data = data || $2 where id = $1`,
            [p.id, JSON.stringify({ apiKey: crypto.randomUUID() })]
          )
        })
    )
    const marketCreations = [
      {
        question: 'test ' + Math.random().toString(36).substring(7),
        outcomeType: 'MULTIPLE_CHOICE',
        answers: Array(50)
          .fill(0)
          .map((_, i) => 'answer ' + i),
        shouldAnswersSumToOne: true,
      },
      // {
      //   question: 'test ' + Math.random().toString(36).substring(7),
      //   outcomeType: 'BINARY',
      // },
      // {
      //   question: 'test ' + Math.random().toString(36).substring(7),
      //   outcomeType: 'MULTIPLE_CHOICE',
      //   answers: Array(50)
      //     .fill(0)
      //     .map((_, i) => 'answer ' + i),
      //   shouldAnswersSumToOne: false,
      // },
    ]

    const markets = await Promise.all(
      marketCreations.map(async (market) => {
        const resp = await fetch(
          `https://${DEV_CONFIG.apiEndpoint}/v0/market`,
          {
            method: 'POST',
            headers: {
              Authorization: `Key ${privateUsers[0].apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(market),
          }
        )
        if (resp.status !== 200) {
          console.error('Failed to create market', await resp.text())
        }
        return resp.json()
      })
    )
    console.log(`${privateUsers.length} user balances incremented by 1000`)
    const contracts = await pg.map(
      `select * from contracts where slug in ($1:list)`,
      [markets.map((m: any) => m.slug)],
      convertContract
    )
    console.log(`Found ${contracts.length} contracts`)

    let totalVisits = 0
    let totalBets = 0
    let totalVisitErrors = 0
    let totalBetErrors = 0
    const startTime = Date.now()
    const userSpentAmounts: { [key: string]: number } = {}
    const errorMessage: { [key: string]: number } = {}

    const runChaos = async () => {
      console.log('Chaos reigns...')
      await Promise.all(
        privateUsers.map(async (user) => {
          const manyBetsPromise = async () => {
            const betCount = Math.floor(Math.random() * 5) + 1
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
            ...visitPromises.map((p) => p()),
            manyBetsPromise(),
          ])
        })
      )
    }

    const reportStats = () => {
      const elapsedSeconds = (Date.now() - startTime) / 1000
      console.log(`----- Stats report -----`)
      console.log(`----- Errors follow -----`)
      Object.entries(errorMessage).map(([key, value]) => {
        console.log(`Error seen ${value} times: ${key}`)
      })
      console.log(`----- End of errors -----`)
      console.log(`Total error visits: ${totalVisitErrors}`)
      console.log(`Total error bets: ${totalBetErrors}`)
      console.log(`Total successful visits: ${totalVisits}`)
      console.log(`Total successful bets: ${totalBets}`)
      console.log(
        `Successful visits per second: ${(totalVisits / elapsedSeconds).toFixed(
          2
        )}`
      )
      console.log(
        `Successful bets per second: ${(totalBets / elapsedSeconds).toFixed(2)}`
      )
      console.log(`Total time elapsed: ${elapsedSeconds.toFixed(2)} seconds`)
      console.log(`-------------------------`)
    }

    // Run report stats and repeat chaos
    const reportInterval = setInterval(reportStats, 5000)
    const chaosInterval = setInterval(runChaos, 10000)

    // Handle script termination
    process.on('SIGINT', async () => {
      clearInterval(chaosInterval)
      clearInterval(reportInterval)
      reportStats()
      console.log('Chaos no longer reigns.')
      process.exit()
    })

    // Run chaos for the first time
    await runChaos()
    // Keep the script running
    await new Promise(() => {})
  })
}

async function visitContract(contract: Contract) {
  return fetch(formatApiUrlWithParams('market', { contractId: contract.id }), {
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
  const limitProb =
    Math.random() > 0.5 ? parseFloat(Math.random().toPrecision(1)) : undefined

  const betData = removeUndefinedProps({
    contractId: contract.id,
    amount: Math.random() * 100,
    outcome: Math.random() > 0.5 ? 'YES' : 'NO',
    answerId:
      contract.mechanism === 'cpmm-multi-1'
        ? contract.answers[Math.floor(Math.random() * contract.answers.length)]
            ?.id
        : undefined,
    limitProb: limitProb === 0 ? 0.1 : limitProb === 1 ? 0.9 : limitProb,
  })
  let success = 0
  let failure = 0
  let totalSpent = 0
  const executionTimes: number[] = []

  const errorMessage: { [key: string]: number } = {}
  for (let i = 0; i < count; i++) {
    const start = Date.now()
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 2000))
    await fetch(BET_URL, {
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
