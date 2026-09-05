import { Answer } from 'common/answer'
import { FullMarketSearchResult } from 'common/api/market-search-types'
import { Contract } from 'common/contract'
import {
  DISCOVERY_RESULT_CLICK_EVENT,
  DiscoveryResultTracking,
} from 'common/discovery-experiment'
import { orderCombinedSearchResults } from 'common/search-result-order'
import { TopLevelPost } from 'common/top-level-post'
import { buildArray } from 'common/util/array'
import { Key } from 'react'
import { track } from 'web/lib/service/analytics'
import { isABTestAssignmentCurrent } from 'web/hooks/use-ab-test'
import { PostRow } from '../posts/post-row'
import { QUERY_KEY, SearchParams, SORT_KEY, TOPIC_FILTER_KEY } from '../search'
import {
  actionColumn,
  boostedColumn,
  liquidityColumn,
  probColumn,
  traderColumn,
} from './contract-table-col-formats'
import { ContractRow } from './contracts-table'

type CombinedResultsProps = {
  contracts: FullMarketSearchResult[]
  posts: TopLevelPost[]
  searchParams: SearchParams
  onContractClick?: (contract: Contract) => void
  highlightContractIds?: string[]
  answersByContractId?: { [contractId: string]: Answer[] }
  hideAvatars?: boolean
  hideActions?: boolean
  hasBets?: boolean
  discoveryTracking?: DiscoveryResultTracking
}

// Type guard to check if an item is a Contract
function isContract(
  item: FullMarketSearchResult | TopLevelPost
): item is FullMarketSearchResult {
  return 'mechanism' in item
}

// Type guard to check if an item is a Post
function isPost(item: Contract | TopLevelPost): item is TopLevelPost {
  return 'title' in item && !('mechanism' in item) // Ensure it's not also a contract like object
}

export function CombinedResults(props: CombinedResultsProps) {
  const {
    contracts,
    posts,
    searchParams,
    onContractClick,
    highlightContractIds,
    answersByContractId,
    hideAvatars,
    hideActions,
    hasBets,
    discoveryTracking,
  } = props

  const sort =
    searchParams[TOPIC_FILTER_KEY] === 'recent'
      ? undefined
      : searchParams[SORT_KEY]
  const combinedItems = orderCombinedSearchResults(contracts, posts, {
    sort,
    preserveUnmarkedContractOrder:
      sort === 'score' && searchParams[QUERY_KEY].trim().length > 0,
  })
  if (!combinedItems.length) return null

  // Define columns for ContractRow, similar to how ContractsTable did
  const contractDisplayColumns = buildArray([
    !hasBets && boostedColumn,
    traderColumn,
    liquidityColumn,
    probColumn,
    !hideActions && actionColumn,
  ])

  return (
    <>
      {combinedItems.map((item, index) => {
        if (isContract(item)) {
          return (
            <ContractRow
              key={item.id as Key}
              contract={item}
              onClick={
                onContractClick ? () => onContractClick(item) : undefined
              }
              highlighted={highlightContractIds?.includes(item.id)}
              answers={answersByContractId?.[item.id]}
              hideAvatar={hideAvatars}
              columns={contractDisplayColumns} // Pass the defined columns
              showPosition={hasBets}
              onTrackClick={
                discoveryTracking
                  ? () => {
                      if (
                        !isABTestAssignmentCurrent(
                          discoveryTracking.assignmentKey
                        )
                      ) {
                        return
                      }
                      void track(DISCOVERY_RESULT_CLICK_EVENT, {
                        contractId: item.id,
                        schemaVersion: 1,
                        presentationId: discoveryTracking.presentationId,
                        resultSetId: discoveryTracking.resultSetId,
                        variant: discoveryTracking.variant,
                        assignmentSource: discoveryTracking.source,
                        sourceComponent: discoveryTracking.sourceComponent,
                        surface: discoveryTracking.surface,
                        compatibilityFallback:
                          discoveryTracking.compatibilityFallback,
                        rank: index + 1,
                        itemType: 'market',
                        matchType: item.searchMatchType ?? 'lexical',
                      })
                    }
                  : undefined
              }
            />
          )
        } else if (isPost(item)) {
          return (
            <PostRow
              key={item.id as Key}
              post={item}
              highlighted={highlightContractIds?.includes(item.id)} // Assuming posts can also be highlighted by ID
              hideAvatar={hideAvatars}
              onTrackClick={
                discoveryTracking
                  ? () => {
                      if (
                        !isABTestAssignmentCurrent(
                          discoveryTracking.assignmentKey
                        )
                      ) {
                        return
                      }
                      void track(DISCOVERY_RESULT_CLICK_EVENT, {
                        schemaVersion: 1,
                        presentationId: discoveryTracking.presentationId,
                        resultSetId: discoveryTracking.resultSetId,
                        variant: discoveryTracking.variant,
                        assignmentSource: discoveryTracking.source,
                        sourceComponent: discoveryTracking.sourceComponent,
                        surface: discoveryTracking.surface,
                        compatibilityFallback:
                          discoveryTracking.compatibilityFallback,
                        rank: index + 1,
                        itemType: 'post',
                        postId: item.id,
                      })
                    }
                  : undefined
              }
            />
          )
        }
        return null // Should not be reached if type guards are exhaustive
      })}
    </>
  )
}
