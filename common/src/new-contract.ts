import {
  add_answers_mode,
  Binary,
  BountiedQuestion,
  Contract,
  CPMM,
  CPMMMulti,
  NonBet,
  CREATEABLE_OUTCOME_TYPES,
  Poll,
  PseudoNumeric,
  Stonk,
  Visibility,
} from './contract'
import { User } from './user'
import { removeUndefinedProps } from './util/object'
import { JSONContent } from '@tiptap/core'
import { computeBinaryCpmmElasticityFromAnte } from './calculate-metrics'
import { randomString } from './util/random'
import { PollOption } from './poll-option'
import { Answer } from './answer'
import { getMultiCpmmLiquidity } from './calculate-cpmm'

export const NEW_MARKET_IMPORTANCE_SCORE = 0.25

export function getNewContract(props: {
  id: string
  slug: string
  creator: User
  question: string
  outcomeType: typeof CREATEABLE_OUTCOME_TYPES[number]
  description: JSONContent
  initialProb: number
  ante: number
  closeTime: number | undefined
  visibility: Visibility
  coverImageUrl?: string

  // twitch
  isTwitchContract: boolean | undefined

  // used for numeric markets
  min: number
  max: number
  isLogScale: boolean
  answers: string[]
  addAnswersMode: add_answers_mode | undefined
  shouldAnswersSumToOne: boolean | undefined

  // Manifold.love
  loverUserId1: string | undefined
  loverUserId2: string | undefined
}) {
  const {
    id,
    slug,
    creator,
    question,
    outcomeType,
    description,
    initialProb,
    ante,
    closeTime,
    visibility,
    isTwitchContract,
    min,
    max,
    isLogScale,
    answers,
    addAnswersMode,
    shouldAnswersSumToOne,
    loverUserId1,
    loverUserId2,
    coverImageUrl,
  } = props
  const createdTime = Date.now()

  const propsByOutcomeType = {
    BINARY: () => getBinaryCpmmProps(initialProb, ante),
    PSEUDO_NUMERIC: () =>
      getPseudoNumericCpmmProps(initialProb, ante, min, max, isLogScale),
    MULTIPLE_CHOICE: () =>
      getMultipleChoiceProps(
        id,
        creator.id,
        answers,
        addAnswersMode ?? 'DISABLED',
        shouldAnswersSumToOne ?? true,
        ante
      ),
    STONK: () => getStonkCpmmProps(initialProb, ante),
    BOUNTIED_QUESTION: () => getBountiedQuestionProps(),
    POLL: () => getPollProps(answers),
  }[outcomeType]()

  const contract: Contract = removeUndefinedProps({
    id,
    slug,
    ...propsByOutcomeType,

    creatorId: creator.id,
    creatorName: creator.name,
    creatorUsername: creator.username,
    creatorAvatarUrl: creator.avatarUrl,
    creatorCreatedTime: creator.createdTime,
    coverImageUrl,

    question: question.trim(),
    description,
    visibility,
    unlistedById: visibility === 'unlisted' ? creator.id : undefined,
    isResolved: false,
    createdTime,
    closeTime,
    dailyScore: 0,
    popularityScore: 0,
    importanceScore: NEW_MARKET_IMPORTANCE_SCORE,
    uniqueBettorCount: 0,
    lastUpdatedTime: createdTime,

    volume: 0,
    volume24Hours: 0,
    elasticity:
      propsByOutcomeType.mechanism === 'cpmm-1'
        ? computeBinaryCpmmElasticityFromAnte(ante)
        : 4.99,

    collectedFees: {
      creatorFee: 0,
      liquidityFee: 0,
      platformFee: 0,
    },

    isTwitchContract,
    loverUserId1,
    loverUserId2,
  })

  return contract as Contract
}

/*
import { PHANTOM_ANTE } from './antes'
import { calcDpmInitialPool } from './calculate-dpm'
const getBinaryDpmProps = (initialProb: number, ante: number) => {
  const { sharesYes, sharesNo, poolYes, poolNo, phantomYes, phantomNo } =
    calcDpmInitialPool(initialProb, ante, PHANTOM_ANTE)

  const system: DPM & Binary = {
    mechanism: 'dpm-2',
    outcomeType: 'BINARY',
    initialProbability: initialProb / 100,
    phantomShares: { YES: phantomYes, NO: phantomNo },
    pool: { YES: poolYes, NO: poolNo },
    totalShares: { YES: sharesYes, NO: sharesNo },
    totalBets: { YES: poolYes, NO: poolNo },
  }

  return system
}
*/

const getBinaryCpmmProps = (initialProb: number, ante: number) => {
  const pool = { YES: ante, NO: ante }
  const p = initialProb / 100

  const system: CPMM & Binary = {
    mechanism: 'cpmm-1',
    outcomeType: 'BINARY',
    totalLiquidity: ante,
    subsidyPool: 0,
    initialProbability: p,
    p,
    pool: pool,
    prob: initialProb,
    probChanges: { day: 0, week: 0, month: 0 },
  }

  return system
}

const getPseudoNumericCpmmProps = (
  initialProb: number,
  ante: number,
  min: number,
  max: number,
  isLogScale: boolean
) => {
  const system: CPMM & PseudoNumeric = {
    ...getBinaryCpmmProps(initialProb, ante),
    outcomeType: 'PSEUDO_NUMERIC',
    min,
    max,
    isLogScale,
  }

  return system
}
const getStonkCpmmProps = (initialProb: number, ante: number) => {
  const system: CPMM & Stonk = {
    ...getBinaryCpmmProps(initialProb, ante),
    outcomeType: 'STONK',
  }
  return system
}

const getMultipleChoiceProps = (
  contractId: string,
  userId: string,
  answers: string[],
  addAnswersMode: add_answers_mode,
  shouldAnswersSumToOne: boolean,
  ante: number
) => {
  const answersWithOther = answers.concat(
    !shouldAnswersSumToOne || addAnswersMode === 'DISABLED' ? [] : ['Other']
  )
  const answerObjects = createAnswers(
    contractId,
    userId,
    addAnswersMode,
    shouldAnswersSumToOne,
    ante,
    answersWithOther
  )
  const system: CPMMMulti = {
    mechanism: 'cpmm-multi-1',
    outcomeType: 'MULTIPLE_CHOICE',
    addAnswersMode: addAnswersMode ?? 'DISABLED',
    shouldAnswersSumToOne: shouldAnswersSumToOne ?? true,
    answers: answerObjects,
    totalLiquidity: ante,
    subsidyPool: 0,
  }

  return system
}

function createAnswers(
  contractId: string,
  userId: string,
  addAnswersMode: add_answers_mode,
  shouldAnswersSumToOne: boolean,
  ante: number,
  answers: string[]
) {
  const ids = answers.map(() => randomString())

  let prob = 0.5
  let poolYes = ante / answers.length
  let poolNo = ante / answers.length

  if (shouldAnswersSumToOne && answers.length > 1) {
    const n = answers.length
    prob = 1 / n
    // Maximize use of ante given constraint that one answer resolves YES and
    // the rest resolve NO.
    // Means that:
    //   ante = poolYes + (n - 1) * poolNo
    // because this pays out ante mana to winners in this case.
    // Also, cpmm identity for probability:
    //   1 / n = poolNo / (poolYes + poolNo)
    poolNo = ante / (2 * n - 2)
    poolYes = ante / 2

    // Naive solution that doesn't maximize liquidity:
    // poolYes = ante * prob
    // poolNo = ante * (prob ** 2 / (1 - prob))
  }

  const now = Date.now()

  return answers.map((text, i) => {
    const id = ids[i]
    const answer: Answer = {
      id,
      index: i,
      contractId,
      userId,
      text,
      createdTime: now,

      poolYes,
      poolNo,
      prob,
      totalLiquidity: getMultiCpmmLiquidity({ YES: poolYes, NO: poolNo }),
      subsidyPool: 0,
      isOther:
        shouldAnswersSumToOne &&
        addAnswersMode !== 'DISABLED' &&
        i === answers.length - 1,
    }
    return answer
  })
}

const getBountiedQuestionProps = () => {
  const system: NonBet & BountiedQuestion = {
    mechanism: 'none',
    outcomeType: 'BOUNTIED_QUESTION',
    bountyTxns: [],
    totalBounty: 0,
    bountyLeft: 0,
  }

  return system
}

const getPollProps = (answers: string[]) => {
  const ids = answers.map(() => randomString())

  const options: PollOption[] = answers.map((answer, i) => ({
    id: ids[i],
    index: i,
    text: answer,
    votes: 0,
  }))

  const system: NonBet & Poll = {
    mechanism: 'none',
    outcomeType: 'POLL',
    options: options,
  }
  return system
}
