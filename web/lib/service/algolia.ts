import algoliasearch from 'algoliasearch/lite'
import { ENV } from 'common/envs/constants'

export const searchClient = algoliasearch(
  'GJQPAYENIF',
  '75c28fc084a80e1129d427d470cf41a3'
)

const indexPrefix = ENV === 'DEV' ? 'dev-' : ''
export const searchIndexName =
  ENV === 'DEV' ? 'dev-contracts' : 'contractsIndex'

export const getIndexName = (sort: string) => {
  return `${indexPrefix}contracts-${sort}`
}

export const trendingIndex = searchClient.initIndex(getIndexName('score'))
export const newIndex = searchClient.initIndex(getIndexName('newest'))
export const probChangeDescendingIndex = searchClient.initIndex(
  getIndexName('prob-change-day')
)
export const probChangeAscendingIndex = searchClient.initIndex(
  getIndexName('prob-change-day-ascending')
)
export const dailyScoreIndex = searchClient.initIndex(
  getIndexName('daily-score')
)
