import { sortBy } from 'lodash'
import {
  POLL_OPTION_SORTS,
  PollContract,
  PollOptionSort,
  PollType,
} from './contract'

export type PollOption = {
  id: string
  index: number // Order of the options in the list
  text: string
  votes: number
  // Borda score for ranked-choice polls (used for display/sorting)
  rankedVoteScore?: number
}

// How polls have always been displayed once results are visible.
export const DEFAULT_POLL_OPTION_SORT: PollOptionSort = 'votes-desc'

export const isPollOptionSort = (sort: unknown): sort is PollOptionSort =>
  POLL_OPTION_SORTS.some((s) => s.value === sort)

// The sort saved on the poll by its creator (or a mod), falling back to most
// votes first. Guards against unknown values set through the API.
export const getDefaultPollSort = (
  contract: Pick<PollContract, 'sort'>
): PollOptionSort =>
  isPollOptionSort(contract.sort) ? contract.sort : DEFAULT_POLL_OPTION_SORT

// The number that ranks an option: Borda points for ranked-choice polls,
// otherwise the vote count.
export const getPollOptionScore = (
  option: PollOption,
  pollType: PollType = 'single'
) => (pollType === 'ranked-choice' ? option.rankedVoteScore ?? 0 : option.votes)

// Orders options for display. Ties keep the creator's original order.
export const sortPollOptions = <T extends PollOption>(
  contract: Pick<PollContract, 'sort' | 'pollType'>,
  options: T[],
  sort?: PollOptionSort
) => {
  const { pollType = 'single' } = contract
  sort = sort ?? getDefaultPollSort(contract)

  if (sort === 'votes-asc') {
    return sortBy(options, [(o) => getPollOptionScore(o, pollType), 'index'])
  }
  if (sort === 'original') {
    return sortBy(options, 'index')
  }
  if (sort === 'alphabetical') {
    return sortBy(options, [(o) => o.text.toLowerCase(), 'index'])
  }
  // 'votes-desc'
  return sortBy(options, [(o) => -getPollOptionScore(o, pollType), 'index'])
}
