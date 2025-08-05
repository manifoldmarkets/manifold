import { Answer } from 'common/answer'
import { Contract } from 'common/contract'
import { TopLevelPost } from 'common/top-level-post'
import { buildArray } from 'common/util/array'
import { sortBy } from 'lodash'
import { Key } from 'react'
import { PostRow } from '../posts/post-row'
import {
  SearchParams,
  SORT_KEY,
  SORTS_MIXING_POSTS_AND_MARKETS,
  TOPIC_FILTER_KEY,
} from '../search'
import {
  actionColumn,
  boostedColumn,
  liquidityColumn,
  probColumn,
  traderColumn,
} from './contract-table-col-formats'
import { ContractRow } from './contracts-table'

type CombinedResultsProps = {
  contracts: Contract[]
  posts: TopLevelPost[]
  searchParams: SearchParams
  onContractClick?: (contract: Contract) => void
  highlightContractIds?: string[]
  answersByContractId?: { [contractId: string]: Answer[] }
  hideAvatars?: boolean
  hideActions?: boolean
  hasBets?: boolean
}

// Type guard to check if an item is a Contract
function isContract(item: Contract | TopLevelPost): item is Contract {
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
  } = props

  const sort =
    searchParams[TOPIC_FILTER_KEY] === 'recent'
      ? undefined
      : searchParams[SORT_KEY]
  let combinedItems: (Contract | TopLevelPost)[] = []
  combinedItems =
    sort && SORTS_MIXING_POSTS_AND_MARKETS.includes(sort)
      ? sortBy([...contracts, ...posts], (item) => {
          if (sort === 'newest') return -item.createdTime
          if (sort === 'score') return -item.importanceScore
          return 0
        })
      : [...contracts, ...posts]
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
      {combinedItems.map((item) => {
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
            />
          )
        } else if (isPost(item)) {
          return (
            <PostRow
              key={item.id as Key}
              post={item}
              highlighted={highlightContractIds?.includes(item.id)} // Assuming posts can also be highlighted by ID
              hideAvatar={hideAvatars}
            />
          )
        }
        return null // Should not be reached if type guards are exhaustive
      })}
    </>
  )
}
