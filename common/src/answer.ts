import { sortBy } from 'lodash'
import { MultiContract, resolution } from './contract'
import { getAnswerProbability } from './calculate'

export type Answer = {
  id: string
  index: number // Order of the answer in the list
  contractId: string
  userId: string
  text: string
  createdTime: number

  // Mechanism props
  poolYes: number // YES shares
  poolNo: number // NO shares
  prob: number // Computed from poolYes and poolNo.
  totalLiquidity: number // for historical reasons, this the total subsidy amount added in M
  subsidyPool: number // current value of subsidy pool in M

  // Is this 'Other', the answer that represents all other answers, including answers added in the future.
  isOther?: boolean

  resolution?: resolution
  resolutionTime?: number
  resolutionProbability?: number
  resolverId?: string

  probChanges: {
    day: number
    week: number
    month: number
  }

  loverUserId?: string
}

export type DpmAnswer = {
  id: string
  number: number
  contractId: string
  createdTime: number

  userId: string
  username: string
  name: string
  avatarUrl?: string

  text: string
}

export const MAX_ANSWER_LENGTH = 240

export const MAX_ANSWERS = 100
export const MAX_INDEPENDENT_ANSWERS = 100

export const isDpmAnswer = (answer: any): answer is DpmAnswer => {
  return answer && !('isOther' in answer)
}
export const getMaximumAnswers = (shouldAnswersSumToOne: boolean) =>
  shouldAnswersSumToOne ? MAX_ANSWERS : MAX_INDEPENDENT_ANSWERS

export type MultiSort =
  | 'prob-desc'
  | 'prob-asc'
  | 'old'
  | 'new'
  | 'liquidity'
  | 'alphabetical'

export const getDefaultSort = (contract: MultiContract) => {
  const { sort, answers, mechanism } = contract
  if (sort) return sort
  if (mechanism === 'dpm-2' || mechanism === 'cpmm-2') return 'old'
  if (contract.addAnswersMode === 'DISABLED') return 'old'
  else if (!contract.shouldAnswersSumToOne) return 'prob-desc'
  else if (answers.length > 10) return 'prob-desc'
  return 'old'
}

export const sortAnswers = <T extends Answer | DpmAnswer>(
  contract: MultiContract,
  answers: T[],
  sort?: MultiSort
) => {
  const { resolutions } = contract
  sort = sort ?? getDefaultSort(contract)

  const shouldAnswersSumToOne =
    'shouldAnswersSumToOne' in contract ? contract.shouldAnswersSumToOne : true

  return sortBy(answers, [
    shouldAnswersSumToOne
      ? // Winners first
        (answer) => (resolutions ? -1 * resolutions[answer.id] : answer)
      : // Resolved last
        (answer) => ('resolution' in answer ? 1 : 0),
    // then by sort
    (answer) => {
      if (sort === 'old') {
        if ('resolutionTime' in answer && answer.resolutionTime)
          return answer.resolutionTime
        return 'index' in answer ? answer.index : answer.number
      } else if (sort === 'new') {
        if ('resolutionTime' in answer && answer.resolutionTime)
          return -answer.resolutionTime
        return 'index' in answer ? -answer.index : -answer.number
      } else if (sort === 'prob-asc') {
        return 'prob' in answer
          ? answer.prob
          : getAnswerProbability(contract, answer.id)
      } else if (sort === 'prob-desc') {
        const prob =
          'prob' in answer
            ? answer.prob
            : getAnswerProbability(contract, answer.id)
        return -1 * prob
      } else if (sort === 'liquidity') {
        return 'subsidyPool' in answer ? -answer.subsidyPool : 0
      } else if (sort === 'alphabetical') {
        return answer.text.toLowerCase()
      }
      return 0
    },
  ])
}
