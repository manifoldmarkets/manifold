import {
  BsFillCheckCircleFill,
  BsFillXCircleFill,
  BsUiChecks,
  BsUiChecksGrid,
  BsCalendar2Date,
} from 'react-icons/bs'
import { Col } from 'web/components/layout/col'
import { CgPoll } from 'react-icons/cg'
import { GoNumber } from 'react-icons/go'
import { CreateableOutcomeType, OutcomeType } from 'common/contract'

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
    outcomeType: 'BINARY',
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
    shouldSumToOne: true,
    outcomeType: 'MULTIPLE_CHOICE',
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
    shouldSumToOne: false,
    outcomeType: 'MULTIPLE_CHOICE',
  },
  MULTI_NUMERIC: {
    label: 'Numeric',
    value: 'MULTI_NUMERIC',
    name: 'numeric',
    descriptor: 'A question with a numerical answer.',
    example: 'How many people will come to Taco Tuesday?',
    visual: (
      <Col className="text-primary-400 relative my-auto h-12 w-12">
        <GoNumber className="h-12 w-12" />
      </Col>
    ),
    shouldSumToOne: true,
    outcomeType: 'MULTI_NUMERIC',
  },
  DATE: {
    label: 'Date',
    value: 'DATE',
    name: 'date',
    descriptor: 'A question with a date answer.',
    example: 'When will OpenAI release GPT-7?',
    visual: (
      <Col className="text-primary-400 relative my-auto h-12 w-12">
        <BsCalendar2Date className="h-12 w-12" />
      </Col>
    ),
    shouldSumToOne: true,
    outcomeType: 'DATE',
  },
} as const

export const NON_PREDICTIVE_CONTRACT_TYPES = {
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
    outcomeType: 'POLL',
  },
  // Note: Legacy naming - BOUNTIED_QUESTION is the database/API type for discussion posts.
  // Originally supported bounties, but now just a simple discussion post with no betting/voting.
  // The type name can't easily be changed without a migration.
  BOUNTIED_QUESTION: {
    label: 'Discussion Post',
    value: 'BOUNTIED_QUESTION',
    name: 'discussion post',
    descriptor: `A post for discussion and comments. No betting or voting.`,
    example: `What are your thoughts on the new AI developments?`,
    visual: (
      <Col className="relative my-auto h-12 w-12 text-ink-400">
        <svg className="h-12 w-12" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
        </svg>
      </Col>
    ),
    className: 'hover:!ring-ink-500/50',
    outcomeType: 'BOUNTIED_QUESTION',
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

export const getOutcomeTypeAndSumsToOne = (
  value: keyof typeof ALL_CONTRACT_TYPES
): {
  outcomeType: CreateableOutcomeType
  shouldSumToOne: boolean
} => {
  const contractType =
    ALL_CONTRACT_TYPES[value as keyof typeof ALL_CONTRACT_TYPES]
  return {
    outcomeType: contractType.outcomeType,
    shouldSumToOne:
      'shouldSumToOne' in contractType ? contractType.shouldSumToOne : false,
  }
}
