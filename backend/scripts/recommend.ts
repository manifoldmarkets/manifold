import { getMarketRecommendations, user_data } from 'common/recommendation'
import { sortBy } from 'lodash'
import { readJson, writeJson } from 'shared/helpers/file'
import { getContract } from 'shared/utils'

import { initAdmin } from 'shared/init-admin'
initAdmin()

import {
  loadContracts,
  loadUserDataForRecommendations,
} from 'functions/scheduled/update-recommended'
import { Contract } from 'common/contract'

const recommend = async () => {
  console.log('Recommend script')

  let userData = await readJson<user_data[]>('user-data1.json')

  if (userData) {
    console.log('Loaded view data from file.')
  } else {
    console.log('Loading view data from Firestore...')
    userData = await loadUserDataForRecommendations()
    await writeJson('user-data5.json', userData)
  }

  let contracts = await readJson<Contract[]>('contracts.json')
  if (contracts) {
    console.log('Loaded contracts from file.')
  } else {
    console.log('Loading contracts...')
    contracts = await loadContracts()
    await writeJson('contracts.json', contracts)
  }

  console.log('Computing recommendations...')
  const { getUserContractScores } = getMarketRecommendations(
    contracts,
    userData
  )

  await debug(getUserContractScores)
}

async function debug(
  getUserContractScores: (userId: string) => { [k: string]: number }
) {
  console.log('Destiny user scores')
  await printUserScores('PKj937RvUZYUbnG7IU8sVPN7XYr1', getUserContractScores)

  // console.log('Bembo scores')
  // await printUserScores('G3S3nhcGWhPU3WEtlUYbAH4tv7f1', getUserContractScores)

  // console.log('Stephen scores')
  // await printUserScores('tlmGNz9kjXc2EteizMORes4qvWl2', getUserContractScores)

  console.log('James scores')
  const jamesId = '5LZ4LgYuySdL1huCWe7bti02ghx2'
  await printUserScores(jamesId, getUserContractScores)
}

async function printUserScores(
  userId: string,
  getUserContractScores: (userId: string) => { [k: string]: number }
) {
  const userScores = getUserContractScores(userId)
  const sortedScores = sortBy(Object.entries(userScores), ([, score]) => -score)
  console.log(
    'top scores',
    sortedScores.slice(0, 20),
    (
      await Promise.all(
        sortedScores.slice(0, 20).map(([contractId]) => getContract(contractId))
      )
    ).map((c) => c?.question)
  )

  console.log(
    'bottom scores',
    sortedScores.slice(sortedScores.length - 20),
    (
      await Promise.all(
        sortedScores
          .slice(sortedScores.length - 20)
          .map(([contractId]) => getContract(contractId))
      )
    ).map((c) => c?.question)
  )
}

if (require.main === module) {
  recommend().then(() => process.exit())
}
