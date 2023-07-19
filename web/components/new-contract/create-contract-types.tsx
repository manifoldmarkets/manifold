import { formatMoney } from 'common/util/format'
import {
  BsFillCheckCircleFill,
  BsFillXCircleFill,
  BsUiChecks,
} from 'react-icons/bs'
import { GiReceiveMoney } from 'react-icons/gi'
import { GoNumber } from 'react-icons/go'
import { TfiWrite } from 'react-icons/tfi'
import { Col } from '../layout/col'
import { CgPoll } from 'react-icons/cg'

export const PREDICTIVE_CONTRACT_TYPES = {
  binary: {
    label: 'Yes/No',
    value: 'BINARY',
    name: 'yes/no question',
    descriptor: 'A yes/no question.',
    example: 'Will NASA confirm the discovery of aliens before 2025?',
    visual: (
      <Col className="text-primary-400 relative my-auto h-12 w-12">
        <BsFillCheckCircleFill className="h-6 w-6" />
        <BsFillXCircleFill className=" absolute bottom-0 right-0 h-6 w-6" />
      </Col>
    ),
  },
  multiple_choice: {
    label: 'Multiple choice',
    value: 'MULTIPLE_CHOICE',
    name: 'multiple choice question',
    descriptor: 'A question with multiple answers that you define.',
    example: 'Which of the following candidates will be elected in 2024?',
    visual: (
      <Col className="text-primary-400 relative my-auto h-12 w-12">
        <BsUiChecks className="h-12 w-12" />
      </Col>
    ),
  },
  free_response: {
    label: 'Free response',
    value: 'FREE_RESPONSE',
    name: 'free response question',
    descriptor: 'A question that anyone can write an answer to.',
    example: 'What is the true cause of the UAPs?',
    visual: (
      <Col className="text-primary-400 relative my-auto h-12 w-12">
        <TfiWrite className="h-12 w-12" />
      </Col>
    ),
  },
  numeric: {
    label: 'Numeric',
    value: 'PSEUDO_NUMERIC',
    name: 'numeric question',
    descriptor: 'A question with a numerical answer.',
    example: 'How many people will come to Taco Tuesday?',
    visual: (
      <Col className="text-primary-400 relative my-auto h-12 w-12">
        <GoNumber className="h-12 w-12" />
      </Col>
    ),
  },
}

export const NON_PREDICTIVE_CONTRACT_TYPES = {
  bountied_question: {
    label: 'Bountied Question',
    value: 'BOUNTIED_QUESTION',
    name: 'bountied question',
    descriptor: `A question that anyone can answer for a bounty. The bounty you put up can be distributed however you'd like.`,
    example: `Recommend me sci-fi books, ${formatMoney(
      100
    )} to the top 5 I choose.`,
    visual: (
      <Col className="relative my-auto h-12 w-12 text-teal-400">
        <GiReceiveMoney className="h-12 w-12" />
      </Col>
    ),
    className: 'hover:ring-teal-500/50',
    backgroundColor: 'bg-teal-500/5',
    selectClassName:
      'dark:from-teal-500/20 from-teal-500/30 ring-teal-500 bg-gradient-to-br to-transparent ring-2',
  },
  polls: {
    label: 'Poll',
    value: 'POLL',
    name: 'poll',
    descriptor: `A multiple choice question that people can vote on. Each person can only vote once.`,
    example: `Which color should I wear to prom?`,
    visual: (
      <Col className="relative my-auto h-12 w-12 text-fuchsia-400">
        <CgPoll className="h-12 w-12" />
      </Col>
    ),
    className: 'hover:ring-fuchsia-500/50',
    backgroundColor: 'bg-fuchsia-500/5',
    selectClassName:
      'dark:from-fuchsia-500/20 from-fuchsia-500/30 ring-fuchsia-500 bg-gradient-to-br to-transparent ring-2',
  },
}

export const ALL_CONTRACT_TYPES = {
  ...PREDICTIVE_CONTRACT_TYPES,
  ...NON_PREDICTIVE_CONTRACT_TYPES,
}

type ContractTypeParams =
  typeof ALL_CONTRACT_TYPES[keyof typeof ALL_CONTRACT_TYPES]

export function getContractTypeThingFromValue(
  thing: keyof ContractTypeParams,
  value: string
): string | undefined {
  const contractType = Object.values(ALL_CONTRACT_TYPES).find(
    (contract) => contract.value === value
  )
  return contractType ? (contractType as any)[thing] : undefined
}
