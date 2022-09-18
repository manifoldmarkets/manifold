import algoliasearch from 'algoliasearch/lite'
import { ENV } from 'common/envs/constants'

export const searchClient = algoliasearch(
  'GJQPAYENIF',
  '75c28fc084a80e1129d427d470cf41a3'
)

const indexPrefix = ENV === 'DEV' ? 'dev-' : ''
export const searchIndexName = ENV === 'DEV' ? 'dev-contracts' : 'contractsIndex'

export const getIndexName = (sort: string) => {
  return `${indexPrefix}contracts-${sort}`
}
