import { Answer } from 'common/answer'
import { FullMarketSearchResult } from 'common/api/market-search-types'
import { Contract } from 'common/contract'
import {
  DISCOVERY_RESULT_CLICK_EVENT,
  DiscoveryExperimentVariant,
  DiscoveryResultTracking,
} from 'common/discovery-experiment'
import {
  orderCombinedSearchResults,
  shouldPreserveBackendMarketOrder,
} from 'common/search-result-order'
import { TopLevelPost } from 'common/top-level-post'
import { buildArray } from 'common/util/array'
import { Key, useState } from 'react'
import { track } from 'web/lib/service/analytics'
import { isABTestAssignmentCurrent } from 'web/hooks/use-ab-test'
import { useUser } from 'web/hooks/use-user'
import { PostRow } from '../posts/post-row'
import {
  FOR_YOU_KEY,
  QUERY_KEY,
  SearchParams,
  SORT_KEY,
  TOPIC_FILTER_KEY,
} from '../search'
import {
  actionColumn,
  boostedColumn,
  ColumnFormat,
  liquidityColumn,
  probColumn,
  traderColumn,
} from './contract-table-col-formats'
import { ContractRow } from './contracts-table'
import { UninterestedRowButton } from './uninterested'

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
  discoveryVariant?: DiscoveryExperimentVariant
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
    discoveryVariant,
    discoveryTracking,
  } = props

  const user = useUser()
  // Rows the user marked uninterested from this result set. Dropped here so
  // the row goes at once; the next fetch won't return them.
  const [hiddenByUser, setHiddenByUser] = useState<Record<string, string[]>>({})
  const isForYou =
    searchParams[FOR_YOU_KEY] === '1' && !searchParams[QUERY_KEY].trim()
  const showUninterested = !!user && !hideActions && isForYou
  const hiddenContractIds = user && isForYou ? hiddenByUser[user.id] ?? [] : []
  const setHidden = (contractId: string, hidden: boolean) => {
    if (!user) return
    setHiddenByUser((byUser) => {
      const ids = byUser[user.id] ?? []
      return {
        ...byUser,
        [user.id]: hidden
          ? ids.includes(contractId)
            ? ids
            : [...ids, contractId]
          : ids.filter((id) => id !== contractId),
      }
    })
  }

  const sort =
    searchParams[TOPIC_FILTER_KEY] === 'recent'
      ? undefined
      : searchParams[SORT_KEY]
  const visibleContracts = hiddenContractIds.length
    ? contracts.filter((c) => !hiddenContractIds.includes(c.id))
    : contracts
  const combinedItems = orderCombinedSearchResults(visibleContracts, posts, {
    sort,
    preserveBackendMarketOrder: shouldPreserveBackendMarketOrder(
      discoveryVariant,
      searchParams[QUERY_KEY],
      searchParams[FOR_YOU_KEY] === '1'
    ),
  })
  if (!combinedItems.length) return null

  // Define columns for ContractRow, similar to how ContractsTable did
  const uninterestedColumn: ColumnFormat = {
    header: 'Uninterested',
    width: 'w-7 justify-center',
    content: ({ contract }) => (
      <UninterestedRowButton
        contract={contract}
        onHidden={() => setHidden(contract.id, true)}
        onRestored={() => setHidden(contract.id, false)}
      />
    ),
  }
  const contractDisplayColumns = buildArray([
    !hasBets && boostedColumn,
    traderColumn,
    liquidityColumn,
    probColumn,
    !hideActions && actionColumn,
    showUninterested && uninterestedColumn,
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
