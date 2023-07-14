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
    example: 'Which candidate will be elected in 2024?',
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
    example: 'What will be the highest grossing film in 2023?',
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
    example: 'How much will my coin collection sell for?',
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
    example: `I'll give ${formatMoney(
      1000
    )} to whoever draws the best portrait of my cat?`,
    visual: (
      <Col className="relative my-auto h-12 w-12 text-teal-400">
        <GiReceiveMoney className="h-12 w-12" />
      </Col>
    ),
    selectClass:
      'dark:from-teal-500/20 from-teal-500/30 ring-teal-500 bg-gradient-to-br to-transparent ring-2',
  },
}

export const ALL_CONTRACT_TYPES = {
  ...PREDICTIVE_CONTRACT_TYPES,
  ...NON_PREDICTIVE_CONTRACT_TYPES,
}

export function getNameFromValue(value: string) {
  const types = Object.keys(ALL_CONTRACT_TYPES)

  for (let i = 0; i < types.length; i++) {
    const contractType = (ALL_CONTRACT_TYPES as { [index: string]: any })[
      types[i]
    ]
    if (contractType.value === value) {
      return contractType.name
    }
  }

  return null // Return null or any default value when no match is found
}

export function getExampleFromValue(value: string) {
  const types = Object.keys(ALL_CONTRACT_TYPES)

  for (let i = 0; i < types.length; i++) {
    const contractType = (ALL_CONTRACT_TYPES as { [index: string]: any })[
      types[i]
    ]
    if (contractType.value === value) {
      return contractType.example
    }
  }

  return null // Return null or any default value when no match is found
}
