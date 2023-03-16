import algoliasearch from 'algoliasearch/lite'
import { ENV } from 'common/envs/constants'
import { Contract } from '../firebase/contracts'

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

const searchIndex = searchClient.initIndex(searchIndexName)
export const searchContracts = async (query: string, limit: number) => {
  const { hits } = await searchIndex.search(query, {
    hitsPerPage: limit,
    advancedSyntax: true,
    facetFilters: ['visibility:public'],
  })
  return hits as any as Contract[]
}
