import { Contract } from 'common/contract'
import { getMarketRecommendations } from 'common/recommendation'
import { filterDefined } from 'common/util/array'
import * as admin from 'firebase-admin'
import { Query } from 'firebase-admin/firestore'
import { writeCsv, readCsv } from '../helpers/csv'
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

  let betPairs = await readCsv<{ userId: string; contractId: string }>(
    'bet-pairs.csv'
  )

  if (betPairs) {
    console.log('Loaded bet data from file.')
  } else {
    console.log('Loading bet data from Firestore...')
    betPairs = await loadData()
    await writeCsv('bet-pairs.csv', ['userId', 'contractId'], betPairs)
  }

  console.log('Computing recommendations...')
  const matrix = await getMarketRecommendations(betPairs)
  console.log('result', matrix)
}

if (require.main === module) {
  recommend().then(() => process.exit())
}
