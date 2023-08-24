import * as admin from 'firebase-admin'
import * as fs from 'fs'

import { initAdmin } from './script-init'
initAdmin()

import { getValues } from '../utils'
import { Bet } from 'common/bet'
import { groupBy, keyBy, mapValues, maxBy, sortBy, uniq } from 'lodash'
import { Contract } from 'common/contract'

const firestore = admin.firestore()

async function getProbsPerDay() {
  console.log('Getting probs per day')
  const bets = (
    await getValues<Bet>(
      firestore.collectionGroup('bets').orderBy('createdTime', 'asc')
    )
  ).filter((b) => b.createdTime > new Date('2022-08-07').getTime())
  const betsByContractId = groupBy(bets, 'contractId')

  const contracts = await getValues<Contract>(
    firestore.collection('contracts').orderBy('createdTime', 'asc')
  )
  const contractsById = keyBy(contracts, 'id')

  console.log(`Loaded ${bets.length} bets.`)

  const contractIdToProbsPerDay: {
    [contractId: string]: { [day: string]: number }
  } = {}

  for (const [contractId, bets] of Object.entries(betsByContractId)) {
    const contract = contractsById[contractId]
    console.log(`Contract ${contract.question} has ${bets.length} bets.`)
    const betsPerDay = groupBy(bets, (b) => toDateString(b.createdTime))
    const probsPerDay = mapValues(betsPerDay, (bets) => {
      const lastBet = maxBy(bets, 'createdTime')
      return lastBet!.probAfter
    })
    const resolutionDay = toDateString(contract.resolutionTime ?? 0)
    probsPerDay[resolutionDay] = contract.resolution === 'YES' ? 1 : 0
    contractIdToProbsPerDay[contractId] = probsPerDay
  }

  const allDays = sortBy(
    uniq(
      Object.values(contractIdToProbsPerDay).flatMap((probsPerDay) =>
        Object.keys(probsPerDay)
      )
    )
  )
  console.log('alldays', allDays)
  let prevDay = ''
  for (const day of allDays) {
    for (const contract of contracts) {
      const probsPerDay = contractIdToProbsPerDay[contract.id] ?? {}
      const lastProb = probsPerDay[prevDay]
      if (
        probsPerDay[day] === undefined &&
        lastProb !== undefined &&
        lastProb !== 0 &&
        lastProb !== 1
      ) {
        // Copy prob from previous day, if it exists and contract was not resolved.
        probsPerDay[day] = probsPerDay[prevDay]
      }
    }
    prevDay = day
  }

  const firstRow = ['', ...allDays, 'Outcome']
  const data = contracts.map((contract) => {
    const probs = allDays.map((day) => {
      const probsPerDay = contractIdToProbsPerDay[contract.id] ?? {}
      return probsPerDay[day] ?? ''
    })
    const url = `https://salemcenter.manifold.markets/SalemCenter/${contract.slug}`
    const outcome = contract.resolution === 'YES' ? 1 : 0
    return [url, ...probs, outcome]
  })

  const str = [
    firstRow.join(','),
    ...data.map((dayAndProbs) => dayAndProbs.join(',')),
  ].join('\n')
  try {
    fs.writeFileSync('./market-probabilities.csv', str, { flag: 'w+' })
    // file written successfully
  } catch (err) {
    console.error(err)
  }

  const brierDataRows = [['Market', 'Day', 'Probability', 'Outcome']]
  for (const contract of contracts) {
    for (const day of allDays) {
      const outcome = contract.resolution === 'YES' ? 1 : 0
      const prob = contractIdToProbsPerDay[contract.id][day]
      if (prob !== undefined && prob !== 0 && prob !== 1) {
        brierDataRows.push([
          contract.slug,
          day,
          prob.toString(),
          outcome.toString(),
        ])
      }
    }
  }
  const brierStr = brierDataRows
    .map((dayAndProbs) => dayAndProbs.join(','))
    .join('\n')
  try {
    fs.writeFileSync('./brier-data.csv', brierStr, { flag: 'w+' })
    // file written successfully
  } catch (err) {
    console.error(err)
  }

  console.log(`Finished.`)
}

const toDateString = (time: number) => {
  const date = new Date(time)
  const month = date.getMonth() + 1
  const monthStr = month < 10 ? `0${month}` : `${month}`
  const day = date.getDate()
  const dayStr = day < 10 ? `0${day}` : `${day}`
  return `${date.getFullYear()}-${monthStr}-${dayStr}`
}

if (require.main === module) {
  getProbsPerDay()
    .then(() => process.exit())
    .catch(console.log)
}
