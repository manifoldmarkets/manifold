import {
  BsFillCheckCircleFill,
  BsFillXCircleFill,
  BsUiChecks,
  BsUiChecksGrid,
} from 'react-icons/bs'
import { Col } from 'web/components/layout/col'
import { CgPoll } from 'react-icons/cg'
import { GoNumber } from 'react-icons/go'
import { CreateableOutcomeType, OutcomeType } from 'common/contract'
import { GiReceiveMoney } from 'react-icons/gi'
import { formatMoney } from 'common/util/format'

export const PREDICTIVE_CONTRACT_TYPES = {
  BINARY: {
    label: 'Yes/No',
    value: 'BINARY',
    name: 'yes/no',
    descriptor: 'A yes/no question.',
    example: 'Will NASA confirm the discovery of aliens before 2025?',
    visual: (
      <Col className="text-primary-400 relative my-auto h-12 w-12">
        <BsFillCheckCircleFill className="mr-4 h-6 w-8" />
        <BsFillXCircleFill className=" absolute bottom-0 right-0 ml-4 h-6 w-8" />
      </Col>
    ),
  },
  DEPENDENT_MULTIPLE_CHOICE: {
    label: 'Multiple Choice',
    value: 'DEPENDENT_MULTIPLE_CHOICE',
    name: 'multiple choice',
    descriptor:
      'A multi-choice question where only one option can be selected.',
    example: 'Who will be the next president of the United States?',
    visual: (
      <Col className="text-primary-400 relative my-auto h-12 w-12">
        <BsUiChecksGrid className="h-12 w-12" />
      </Col>
    ),
  },
  INDEPENDENT_MULTIPLE_CHOICE: {
    label: 'Set',
    value: 'INDEPENDENT_MULTIPLE_CHOICE',
    name: 'set',
    descriptor:
      'A question with multiple selectable options. You can think of each answer as its own separate prediction.',
    example: 'Which of the following things will happen during the debate?',
    visual: (
      <Col className="text-primary-400 relative my-auto h-12 w-12">
        <BsUiChecks className="h-12 w-12" />
      </Col>
    ),
  },
  NUMBER: {
    label: 'Numeric (experimental)',
    value: 'NUMBER',
    name: 'numeric',
    descriptor: 'A question with a numerical answer.',
    example:
      'Experimental market type: How many people will come to Taco Tuesday?',
    visual: (
      <Col className="text-primary-400 relative my-auto h-12 w-12">
        <GoNumber className="h-12 w-12" />
      </Col>
    ),
  },
} as const

export const NON_PREDICTIVE_CONTRACT_TYPES = {
  BOUNTIED_QUESTION: {
    label: 'Bounty',
    value: 'BOUNTIED_QUESTION',
    name: 'bounty',
    descriptor: `A question that anyone can answer for a bounty. The bounty you put up can be distributed however you'd like.`,
    example: `Recommend me sci-fi books, ${formatMoney(
      100
    )} for each good submission.`,
    visual: (
      <Col className="relative my-auto h-12 w-12 text-teal-400">
        <GiReceiveMoney className="h-12 w-12" />
      </Col>
    ),
    className: 'hover:ring-teal-500/50',
  },
  POLL: {
    label: 'Poll',
    value: 'POLL',
    name: 'poll',
    descriptor: `A multiple choice question that people can vote on. Each person can only vote once.`,
    example: `Which color should I wear to prom?`,
    visual: (
      <Col className="relative my-auto h-12 w-12 text-orange-300">
        <CgPoll className="h-12 w-12" />
      </Col>
    ),
    className: 'hover:!ring-orange-500/50',
  },
} as const

export const ALL_CONTRACT_TYPES = {
  ...PREDICTIVE_CONTRACT_TYPES,
  ...NON_PREDICTIVE_CONTRACT_TYPES,
}

export function getContractTypeFromValue(
  outcomeType: OutcomeType,
  key: 'example' | 'name'
): string | undefined {
  return Object.keys(ALL_CONTRACT_TYPES).includes(outcomeType)
    ? ALL_CONTRACT_TYPES[outcomeType as keyof typeof ALL_CONTRACT_TYPES][key]
    : undefined
}

export const determineOutcomeType = (
  value: keyof typeof ALL_CONTRACT_TYPES
): {
  outcomeType: CreateableOutcomeType
  shouldSumToOne: boolean
} => {
  if (value === 'INDEPENDENT_MULTIPLE_CHOICE') {
    return { outcomeType: 'MULTIPLE_CHOICE', shouldSumToOne: false }
  } else if (value === 'DEPENDENT_MULTIPLE_CHOICE') {
    return { outcomeType: 'MULTIPLE_CHOICE', shouldSumToOne: true }
  } else {
    return {
      outcomeType: value,
      shouldSumToOne: false,
    }
  }
}
