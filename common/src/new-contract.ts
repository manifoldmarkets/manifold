import { sum } from 'lodash'
import { Answer } from './answer'
import { getInitialAnswerPools, getMultiCpmmLiquidity } from './calculate-cpmm'
import { computeBinaryCpmmElasticityFromAnte } from './calculate-metrics'
import {
  Binary,
  BountiedQuestion,
  CPMM,
  CPMMMulti,
  CPMMNumber,
  CREATEABLE_OUTCOME_TYPES,
  Contract,
  MultiDate,
  MultiNumeric,
  NonBet,
  Poll,
  PollType,
  PollVoterVisibility,
  PseudoNumeric,
  Stonk,
  add_answers_mode,
  MAX_CPMM_PROB,
  MIN_CPMM_PROB,
} from './contract'
import { PollOption } from './poll-option'
import { User } from './user'
import { removeUndefinedProps } from './util/object'
import { randomString } from './util/random'

export const NEW_MARKET_IMPORTANCE_SCORE = 0.25

export function getNewContract(
  props: Pick<
    Contract,
    | 'id'
    | 'slug'
    | 'question'
    | 'description'
    | 'closeTime'
    | 'visibility'
    | 'isTwitchContract'
    | 'token'
    | 'takerAPIOrdersDisabled'
    | 'siblingContractId'
    | 'coverImageUrl'
  > & {
    creator: User
    outcomeType: (typeof CREATEABLE_OUTCOME_TYPES)[number]
    initialProb: number
    ante: number

    // Numeric
    min: number
    max: number
    isLogScale: boolean

    // Multi-choice
    answers: string[]
    addAnswersMode?: add_answers_mode | undefined
    shouldAnswersSumToOne?: boolean | undefined
    answerShortTexts?: string[]
    answerImageUrls?: string[]
    // Starting probability of each answer, as a percent. Defaults to an even split.
    answerProbs?: number[]

    // Bountied
    isAutoBounty?: boolean | undefined

    // Sports
    sportsStartTimestamp?: string
    sportsEventId?: string
    sportsLeague?: string

    // Multi-numeric
    unit: string | undefined
    midpoints: number[] | undefined
    timezone: string | undefined

    // Poll
    voterVisibility: PollVoterVisibility | undefined
    pollType: PollType | undefined
    maxSelections: number | undefined
  }
) {
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
    coverImageUrl,
    isAutoBounty,
    token,
    sportsStartTimestamp,
    sportsEventId,
    sportsLeague,
    answerShortTexts,
    answerImageUrls,
    answerProbs,
    takerAPIOrdersDisabled,
    siblingContractId,
    unit,
    midpoints,
    timezone,
    voterVisibility,
    pollType,
    maxSelections,
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
        ante,
        answerShortTexts,
        answerImageUrls,
        answerProbs
      ),
    STONK: () => getStonkCpmmProps(initialProb, ante),
    BOUNTIED_QUESTION: () => getBountiedQuestionProps(ante, isAutoBounty),
    POLL: () => getPollProps(answers, voterVisibility, pollType, maxSelections),
    NUMBER: () => getNumberProps(id, creator.id, min, max, answers, ante),
    MULTI_NUMERIC: () =>
      getMultiNumericProps(
        id,
        creator.id,
        answers,
        midpoints ?? [],
        ante,
        unit ?? '',
        shouldAnswersSumToOne ?? true
      ),
    DATE: () =>
      getDateProps(
        id,
        creator.id,
        answers,
        midpoints ?? [],
        ante,
        shouldAnswersSumToOne ?? true,
        timezone ?? ''
      ),
    // Perp markets are created through a dedicated /create-perp endpoint with
    // its own required fields (oracleFeedId, maxLeverage, funding params, etc.)
    // so they do not flow through the generic createContract factory.
    PERP: (): never => {
      throw new Error(
        'Perp markets must be created via the /create-perp endpoint'
      )
    },
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
    isResolved: false,
    createdTime,
    closeTime,
    dailyScore: 0,
    popularityScore: 0,
    importanceScore: NEW_MARKET_IMPORTANCE_SCORE,
    freshnessScore: 0,
    conversionScore: DEFAULT_CONVERSION_SCORE,
    uniqueBettorCount: 0,
    uniqueBettorCountDay: 0,
    viewCount: 0,
    lastUpdatedTime: createdTime,

    volume: 0,
    volume24Hours: 0,
    elasticity:
      propsByOutcomeType.mechanism === 'cpmm-1'
        ? computeBinaryCpmmElasticityFromAnte(ante)
        : propsByOutcomeType.mechanism === 'cpmm-multi-1'
        ? 4.99 // TODO: calculate
        : 1_000_000,

    collectedFees: {
      creatorFee: 0,
      liquidityFee: 0,
      platformFee: 0,
    },

    isTwitchContract,
    token,

    sportsStartTimestamp,
    sportsEventId,
    sportsLeague,

    takerAPIOrdersDisabled,
    siblingContractId,
    boosted: false,
  })
  if (visibility === 'unlisted') {
    contract.unlistedById = creator.id
  }

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
    prob: p,
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

export const VERSUS_COLORS = ['#4e46dc', '#e9a23b']

// Bounds on a manually set starting probability, in percent. These match the
// range bets are allowed to move an answer within, so a creator can't open a
// market outside of where traders could ever put it.
export const MIN_ANSWER_PROB = MIN_CPMM_PROB * 100
export const MAX_ANSWER_PROB = MAX_CPMM_PROB * 100
// How far off 100% a sum-to-one market's percentages may be before we reject
// them rather than scaling them to fit. Lets creators type 33/33/33.
export const ANSWER_PROB_SUM_TOLERANCE = 1

// Checks manually set starting probabilities (percent, one per listed answer)
// against the answers they'll be applied to. Returns a message explaining the
// problem, or undefined if they're usable.
export const getAnswerProbsError = (props: {
  answerProbs: number[]
  numAnswers: number
  shouldAnswersSumToOne: boolean
  hasOtherAnswer: boolean
}) => {
  const { answerProbs, numAnswers, shouldAnswersSumToOne, hasOtherAnswer } =
    props

  if (answerProbs.length !== numAnswers)
    return `Expected ${numAnswers} starting probabilities, got ${answerProbs.length}.`

  if (
    answerProbs.some(
      (prob) =>
        !isFinite(prob) || prob < MIN_ANSWER_PROB || prob > MAX_ANSWER_PROB
    )
  )
    return `Each starting probability must be between ${MIN_ANSWER_PROB}% and ${MAX_ANSWER_PROB}%.`

  if (!shouldAnswersSumToOne) return undefined

  const total = sum(answerProbs)
  const rounded = Math.round(total * 10) / 10

  if (hasOtherAnswer) {
    // 'Other' takes whatever is left over, within the same bounds as any
    // other answer.
    if (total > 100 - MIN_ANSWER_PROB)
      return `Starting probabilities add up to ${rounded}%, leaving less than ${MIN_ANSWER_PROB}% for the "Other" answer.`
    if (total < 100 - MAX_ANSWER_PROB)
      return `Starting probabilities add up to ${rounded}%, leaving more than ${MAX_ANSWER_PROB}% for the "Other" answer.`
    return undefined
  }

  if (Math.abs(total - 100) > ANSWER_PROB_SUM_TOLERANCE)
    return `Starting probabilities must add up to 100%, but they add up to ${rounded}%.`

  // Validate the probabilities the pools will actually use. Scaling a total
  // above 100% can otherwise push a 1% answer below the trading floor. Allow
  // only machine-precision noise when comparing against the bounds.
  if (
    getInitialProbs(answerProbs, shouldAnswersSumToOne, hasOtherAnswer).some(
      (prob) =>
        prob < MIN_CPMM_PROB - Number.EPSILON ||
        prob > MAX_CPMM_PROB + Number.EPSILON
    )
  )
    return `After normalization, each starting probability must be between ${MIN_ANSWER_PROB}% and ${MAX_ANSWER_PROB}%.`

  return undefined
}

// Turns starting percentages into the fractions the answer pools are built
// from, appending 'Other's share when the market has one. Assumes they already
// passed getAnswerProbsError.
const getInitialProbs = (
  answerProbs: number[],
  shouldAnswersSumToOne: boolean,
  hasOtherAnswer: boolean
) => {
  if (!shouldAnswersSumToOne) return answerProbs.map((prob) => prob / 100)

  const probs = hasOtherAnswer
    ? [...answerProbs, 100 - sum(answerProbs)]
    : answerProbs
  // Scale out any rounding slop so the answers sum to exactly one.
  const total = sum(probs)
  return probs.map((prob) => prob / total)
}

const getMultipleChoiceProps = (
  contractId: string,
  userId: string,
  answers: string[],
  addAnswersMode: add_answers_mode,
  shouldAnswersSumToOne: boolean,
  ante: number,
  shortTexts?: string[],
  imageUrls?: string[],
  answerProbs?: number[]
) => {
  const isBinaryMulti =
    addAnswersMode === 'DISABLED' &&
    answers.length === 2 &&
    shouldAnswersSumToOne

  const hasOther = shouldAnswersSumToOne && addAnswersMode !== 'DISABLED'
  const answersWithOther = answers.concat(hasOther ? ['Other'] : [])
  const answerObjects = createAnswers(
    contractId,
    userId,
    addAnswersMode,
    shouldAnswersSumToOne,
    ante,
    answersWithOther,
    removeUndefinedProps({
      colors: isBinaryMulti ? VERSUS_COLORS : undefined,
      shortTexts,
      imageUrls,
      probs: answerProbs
        ? getInitialProbs(answerProbs, shouldAnswersSumToOne, hasOther)
        : undefined,
    })
  )
  const system: CPMMMulti = removeUndefinedProps({
    mechanism: 'cpmm-multi-1',
    outcomeType: 'MULTIPLE_CHOICE',
    addAnswersMode: addAnswersMode ?? 'DISABLED',
    shouldAnswersSumToOne: shouldAnswersSumToOne ?? true,
    answers: answerObjects,
    totalLiquidity: ante,
    subsidyPool: 0,
    // Answer probs move with every bet, so keep a record of where the creator
    // opened them for the chart's starting point.
    initialProbabilities: answerProbs
      ? Object.fromEntries(answerObjects.map((a) => [a.id, a.prob]))
      : undefined,
  })

  return system
}

const getNumberProps = (
  contractId: string,
  userId: string,
  min: number,
  max: number,
  answers: string[],
  ante: number
) => {
  const answerObjects = createAnswers(
    contractId,
    userId,
    'DISABLED',
    true,
    ante,
    answers
  )
  const system: CPMMNumber = {
    mechanism: 'cpmm-multi-1',
    outcomeType: 'NUMBER',
    addAnswersMode: 'DISABLED',
    shouldAnswersSumToOne: true,
    answers: answerObjects,
    totalLiquidity: ante,
    subsidyPool: 0,
    max,
    min,
  }

  return system
}
const getMultiNumericProps = (
  contractId: string,
  userId: string,
  answers: string[],
  midpoints: number[],
  ante: number,
  unit: string,
  shouldAnswersSumToOne: boolean
) => {
  const answerObjects = createAnswers(
    contractId,
    userId,
    'DISABLED',
    shouldAnswersSumToOne,
    ante,
    answers,
    { midpoints }
  )
  const system: MultiNumeric = {
    mechanism: 'cpmm-multi-1',
    outcomeType: 'MULTI_NUMERIC',
    shouldAnswersSumToOne,
    addAnswersMode: 'DISABLED',
    answers: answerObjects,
    totalLiquidity: ante,
    subsidyPool: 0,
    unit,
  }

  return system
}
const getDateProps = (
  contractId: string,
  userId: string,
  answers: string[],
  midpoints: number[],
  ante: number,
  shouldAnswersSumToOne: boolean,
  timezone: string
) => {
  const answerObjects = createAnswers(
    contractId,
    userId,
    'DISABLED',
    shouldAnswersSumToOne,
    ante,
    answers,
    { midpoints }
  )
  const system: MultiDate = {
    mechanism: 'cpmm-multi-1',
    outcomeType: 'DATE',
    shouldAnswersSumToOne,
    addAnswersMode: 'DISABLED',
    answers: answerObjects,
    totalLiquidity: ante,
    subsidyPool: 0,
    timezone,
  }

  return system
}

function createAnswers(
  contractId: string,
  userId: string,
  addAnswersMode: add_answers_mode,
  shouldAnswersSumToOne: boolean,
  ante: number,
  answers: string[],
  options: {
    colors?: string[]
    shortTexts?: string[]
    imageUrls?: string[]
    midpoints?: number[]
    // Starting probability of each answer, as a fraction. Defaults to an even split.
    probs?: number[]
  } = {}
) {
  const { colors, shortTexts, imageUrls, midpoints, probs } = options
  const ids = answers.map(() => randomString())

  // Custom starting probabilities: spread the ante around them instead.
  const customPools = probs
    ? getInitialAnswerPools(probs, ante, shouldAnswersSumToOne)
    : undefined

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
    const { YES: answerPoolYes, NO: answerPoolNo } = customPools?.[i] ?? {
      YES: poolYes,
      NO: poolNo,
    }
    const answer: Answer = removeUndefinedProps({
      id,
      index: i,
      contractId,
      userId,
      text,
      createdTime: now,
      color: colors?.[i],
      shortText: shortTexts?.[i],
      imageUrl: imageUrls?.[i],

      poolYes: answerPoolYes,
      poolNo: answerPoolNo,
      prob: probs?.[i] ?? prob,
      totalLiquidity: getMultiCpmmLiquidity({
        YES: answerPoolYes,
        NO: answerPoolNo,
      }),
      subsidyPool: 0,
      isOther:
        shouldAnswersSumToOne &&
        addAnswersMode !== 'DISABLED' &&
        i === answers.length - 1,
      probChanges: { day: 0, week: 0, month: 0 },
      midpoint: midpoints?.[i],
      volume: 0,
    })
    return answer
  })
}

const getBountiedQuestionProps = (
  ante: number,
  isAutoBounty: boolean | undefined
) => {
  const system: NonBet & BountiedQuestion = {
    mechanism: 'none',
    outcomeType: 'BOUNTIED_QUESTION',
    totalBounty: ante,
    bountyLeft: ante,
    isAutoBounty: isAutoBounty ?? false,
  }

  return system
}

const getPollProps = (
  answers: string[],
  voterVisibility: PollVoterVisibility | undefined,
  pollType: PollType | undefined,
  maxSelections: number | undefined
) => {
  const ids = answers.map(() => randomString())

  const options: PollOption[] = answers.map((answer, i) => ({
    id: ids[i],
    index: i,
    text: answer,
    votes: 0,
    // Initialize ranked-choice specific fields
    ...(pollType === 'ranked-choice' ? { rankedVoteScore: 0 } : {}),
  }))

  const system: NonBet & Poll = removeUndefinedProps({
    mechanism: 'none',
    outcomeType: 'POLL',
    options: options,
    voterVisibility,
    pollType,
    maxSelections,
  })
  return system
}

export const DEFAULT_CONVERSION_SCORE_NUMERATOR = 2
export const DEFAULT_CONVERSION_SCORE_DENOMINATOR = 15
export const DEFAULT_CONVERSION_SCORE =
  DEFAULT_CONVERSION_SCORE_NUMERATOR / DEFAULT_CONVERSION_SCORE_DENOMINATOR
