import { CPMMBinaryContract } from 'common/contract'
import { sortBy, uniqBy } from 'lodash'
import { useQuery } from 'react-query'
import {
  probChangeAscendingIndex,
  probChangeDescendingIndex,
} from 'web/lib/service/algolia'

export const useProbChanges = (
  filters: { bettorId?: string; groupSlugs?: string[] } = {}
) => {
  const { bettorId, groupSlugs } = filters

  const bettorFilter = bettorId ? `uniqueBettorIds:${bettorId}` : ''
  const groupFilters = groupSlugs
    ? groupSlugs.map((slug) => `groupLinks.slug:${slug}`)
    : []

  const facetFilters = [
    'isResolved:false',
    'outcomeType:BINARY',
    bettorFilter,
    groupFilters,
  ]
  const searchParams = {
    facetFilters,
    hitsPerPage: 50,
  }

  const { data: positiveChanges } = useQuery(
    ['prob-change-day', groupSlugs],
    () => probChangeDescendingIndex.search<CPMMBinaryContract>('', searchParams)
  )
  const { data: negativeChanges } = useQuery(
    ['prob-change-day-ascending', groupSlugs],
    () => probChangeAscendingIndex.search<CPMMBinaryContract>('', searchParams)
  )

  if (!positiveChanges || !negativeChanges) return undefined

  const hits = uniqBy(
    [...positiveChanges.hits, ...negativeChanges.hits],
    (c) => c.id
  ).filter((c) => c.probChanges)

  return sortBy(hits, (c) => Math.abs(c.probChanges.day)).reverse()
}
