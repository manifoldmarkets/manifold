import { Answer } from './answer'
import {
  cpmmMulti2SumToOneFeasible,
  cpmmMulti2SumToOnePools,
  getCpmmLiquidity,
  getMultiCpmmLiquidity,
} from './calculate-cpmm'
import { computeBinaryCpmmElasticityFromAnte } from './calculate-metrics'
import {
  Binary,
  BountiedQuestion,
  CPMM,
  CPMMMulti,
  CPMMNumber,
  CREATEABLE_OUTCOME_TYPES,
  Contract,
  isMultiCpmmMechanism,
  MultiDate,
  MultiNumeric,
  NonBet,
  Poll,
  PollType,
  PollVoterVisibility,
  PseudoNumeric,
  Stonk,
  add_answers_mode,
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

// (GPnn labels cite machine-checked proofs: https://github.com/evand/manifold-math/tree/main/cpmm-multi-2/proofs)
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
    // cpmm-multi-2: per-answer initial probabilities (percentages in (0,100)).
    // Present ⇒ create a cpmm-multi-2 market with each answer's p set to its
    // (normalized) target prob. Absent ⇒ uniform 1/n cpmm-multi-1 (unchanged).
    initialProbs?: number[] | undefined

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
    initialProbs,
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
        initialProbs
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
        : isMultiCpmmMechanism(propsByOutcomeType.mechanism)
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

const getMultipleChoiceProps = (
  contractId: string,
  userId: string,
  answers: string[],
  addAnswersMode: add_answers_mode,
  shouldAnswersSumToOne: boolean,
  ante: number,
  shortTexts?: string[],
  imageUrls?: string[],
  initialProbs?: number[]
) => {
  const isBinaryMulti =
    addAnswersMode === 'DISABLED' &&
    answers.length === 2 &&
    shouldAnswersSumToOne

  // cpmm-multi-2: per-answer initial probs ⇒ the v2 mechanism. The caller
  // (create-market.ts) has already validated that initialProbs (when present)
  // has one entry per answer, sums-to-one is on, and there is no "Other" answer.
  const isV2 = !!initialProbs && initialProbs.length > 0

  const answersWithOther = answers.concat(
    !shouldAnswersSumToOne || addAnswersMode === 'DISABLED' ? [] : ['Other']
  )
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
      initialProbs,
    })
  )
  const system: CPMMMulti = {
    mechanism: isV2 ? 'cpmm-multi-2' : 'cpmm-multi-1',
    outcomeType: 'MULTIPLE_CHOICE',
    addAnswersMode: addAnswersMode ?? 'DISABLED',
    shouldAnswersSumToOne: shouldAnswersSumToOne ?? true,
    answers: answerObjects,
    totalLiquidity: ante,
    subsidyPool: 0,
  }

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

// The √variance creation rule for cpmm-multi-2 sum-to-one markets. Given the
// normalized target probs q_i (Σ = 1) and the ante, allocate pool depth
// W_i = (1−p_i)Y_i + p_iN_i ∝ √(q_i(1−q_i)) — the variance-weighted depth that
// maximizes effective liquidity under the no-house-risk basket budget (closed
// form; derivation + benchmarks in tasks/cpmm_multi_2, GP13–GP15). Properties:
// reduces to v1's pools exactly at uniform, to a balanced pool at n=2; funds
// exactly (every winning scenario pays the ante) and reads back prob_i = q_i.
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
    initialProbs?: number[]
  } = {}
) {
  const { colors, shortTexts, imageUrls, midpoints, initialProbs } = options
  const ids = answers.map(() => randomString())
  const now = Date.now()

  // Mechanism-independent Answer fields; each branch below supplies only the
  // pool shape (poolYes/poolNo/p/prob/totalLiquidity) and isOther.
  const baseAnswer = (i: number, text: string) => ({
    id: ids[i],
    index: i,
    contractId,
    userId,
    text,
    createdTime: now,
    color: colors?.[i],
    shortText: shortTexts?.[i],
    imageUrl: imageUrls?.[i],
    subsidyPool: 0,
    probChanges: { day: 0, week: 0, month: 0 },
    midpoint: midpoints?.[i],
    volume: 0,
  })

  // cpmm-multi-2: per-answer initial probs, dialed to target via each answer's
  // own `p`. Two regimes (see tasks/cpmm_multi_2/creation-liquidity-findings.md,
  // GP13–GP15):
  //
  // Sum-to-one ("Multiple Choice"): exactly one answer resolves YES, so the raw
  // percentages are normalized to Σ q_i = 1. Pools use the √variance creation
  // rule — depth W_i = (1−p_i)Y_i + p_iN_i ∝ √(q_i(1−q_i)) — which maximizes
  // effective liquidity under the no-house-risk basket budget (every winning
  // scenario pays exactly the ante). It reduces to v1's pools exactly at uniform
  // and to a balanced pool at n=2; for n≥3 skew it is asymmetric with p_i≠q_i.
  //
  // Independent ("Set"): each answer is its own CPMM with no Σ=1 constraint and
  // its own max-loss budget max(Y,N); at fixed risk the liquidity optimum is the
  // balanced pool Y_i=N_i with p_i=q_i — exactly the binary-CPMM construction.
  // Absolute probs (pct/100, no normalization).
  if (initialProbs && initialProbs.length > 0) {
    const n = answers.length
    const sum = initialProbs.reduce((s, x) => s + x, 0)
    const normalized = initialProbs.map((x) => x / sum)
    // GP19a backstop (API layer already 400s): the √variance construction is not
    // total; never persist an insane pool.
    if (shouldAnswersSumToOne && !cpmmMulti2SumToOneFeasible(normalized)) {
      throw new Error(
        'Infeasible sum-to-one initialProbs (GP19a): no sane pool realization exists.'
      )
    }
    const pools = shouldAnswersSumToOne
      ? cpmmMulti2SumToOnePools(normalized, ante)
      : initialProbs.map((x) => {
          const L = ante / n
          const prob = x / 100
          return { poolYes: L, poolNo: L, p: prob, prob }
        })
    return answers.map((text, i) => {
      const { poolYes, poolNo, p, prob } = pools[i]
      const answer: Answer = removeUndefinedProps({
        ...baseAnswer(i, text),
        poolYes,
        poolNo,
        p,
        prob,
        // True general-p CPMM liquidity invariant k = Y^p · N^(1-p). getMultiCpmmLiquidity is the
        // p=0.5 special case √(Y·N), which understates depth on the √variance asymmetric v2 pools
        // (Y_i≠N_i, p_i≠0.5). Balanced Set pools (Y=N) give the same value either way.
        totalLiquidity: getCpmmLiquidity({ YES: poolYes, NO: poolNo }, p),
        isOther: false,
      })
      return answer
    })
  }

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

  return answers.map((text, i) => {
    const answer: Answer = removeUndefinedProps({
      ...baseAnswer(i, text),
      poolYes,
      poolNo,
      p: 0.5, // cpmm-multi-1 / cpmm-multi-2-at-uniform-init; per-answer p set on v2 creation (PR2c)
      prob,
      totalLiquidity: getMultiCpmmLiquidity({ YES: poolYes, NO: poolNo }),
      isOther:
        shouldAnswersSumToOne &&
        addAnswersMode !== 'DISABLED' &&
        i === answers.length - 1,
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
const DEFAULT_CONVERSION_SCORE =
  DEFAULT_CONVERSION_SCORE_NUMERATOR / DEFAULT_CONVERSION_SCORE_DENOMINATOR
