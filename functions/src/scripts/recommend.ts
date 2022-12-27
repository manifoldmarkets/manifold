import { Contract } from 'common/contract'
import { getMarketRecommendations } from 'common/recommendation'
import { filterDefined } from 'common/util/array'
import * as admin from 'firebase-admin'
import { Query } from 'firebase-admin/firestore'
import { createCsv, readCsv } from '../helpers/csv'
import { loadPaginated } from '../utils'

import { initAdmin } from './script-init'
initAdmin()

const loadData = async () => {
  const contractUniqueBettorIds = await loadPaginated(
    admin
      .firestore()
      .collection('contracts')
      .select('id', 'uniqueBettorIds') as Query<
      Pick<Contract, 'id' | 'uniqueBettorIds'>
    >
  )
  const betPairs = filterDefined(
    contractUniqueBettorIds.map(({ id: contractId, uniqueBettorIds }) =>
      uniqueBettorIds?.map((userId) => ({
        userId,
        contractId,
      }))
    )
  ).flat()

  return betPairs
}

const recommend = async () => {
  console.log('Recommend script')

  let betPairs: { userId: string; contractId: string }[]
  try {
    const { rows } = await readCsv<{ userId: string; contractId: string }>(
      'bet-pairs.csv'
    )
    betPairs = rows
    console.log('Loaded bet data from file.')
  } catch (e) {
    console.log('Loading bet data from Firestore...')
    betPairs = await loadData()
    await createCsv('bet-pairs.csv', ['userId', 'contractId'], betPairs)
  }

  console.log('Computing recommendations...')
  const matrix = await getMarketRecommendations(betPairs)
  console.log('result', matrix)
}

if (require.main === module) {
  recommend().then(() => process.exit())
}
