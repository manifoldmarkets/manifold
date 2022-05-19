import * as admin from 'firebase-admin'

import {
  Binary,
  Contract,
  CPMM,
  DPM,
  FreeResponse,
  FullContract,
  MAX_DESCRIPTION_LENGTH,
  MAX_QUESTION_LENGTH,
  MAX_TAG_LENGTH,
  Numeric,
  OUTCOME_TYPES,
} from '../../common/contract'
import { slugify } from '../../common/util/slugify'
import { randomString } from '../../common/util/random'

import { chargeUser } from './utils'
import { APIError, newEndpoint, parseCredentials, lookupUser } from './api'

import {
  FIXED_ANTE,
  getAnteBets,
  getCpmmInitialLiquidity,
  getFreeAnswerAnte,
  getNumericAnte,
  HOUSE_LIQUIDITY_PROVIDER_ID,
  MINIMUM_ANTE,
} from '../../common/antes'
import { getNoneAnswer } from '../../common/answer'
import { getNewContract } from '../../common/new-contract'
import { NUMERIC_BUCKET_COUNT } from '../../common/numeric-constants'

export const createContract = newEndpoint(['POST'], async (req, _res) => {
  const [creator, _privateUser] = await lookupUser(await parseCredentials(req))
  let {
    question,
    outcomeType,
    description,
    initialProb,
    closeTime,
    tags,
    min,
    max,
    manaLimitPerUser,
  } = req.body || {}

  if (!question || typeof question != 'string')
    throw new APIError(400, 'Missing or invalid question field')

  question = question.slice(0, MAX_QUESTION_LENGTH)

  if (typeof description !== 'string')
    throw new APIError(400, 'Invalid description field')

  description = description.slice(0, MAX_DESCRIPTION_LENGTH)

  if (tags !== undefined && !Array.isArray(tags))
    throw new APIError(400, 'Invalid tags field')

  tags = (tags || []).map((tag: string) =>
    tag.toString().slice(0, MAX_TAG_LENGTH)
  )

  outcomeType = outcomeType ?? 'BINARY'

  if (!OUTCOME_TYPES.includes(outcomeType))
    throw new APIError(400, 'Invalid outcomeType')

  if (
    outcomeType === 'NUMERIC' &&
    !(
      min !== undefined &&
      max !== undefined &&
      isFinite(min) &&
      isFinite(max) &&
      min < max &&
      max - min > 0.01
    )
  )
    throw new APIError(400, 'Invalid range')

  if (
    outcomeType === 'BINARY' &&
    (!initialProb || initialProb < 1 || initialProb > 99)
  )
    throw new APIError(400, 'Invalid initial probability')

  // uses utc time on server:
  const today = new Date().setHours(0, 0, 0, 0)
  const userContractsCreatedTodaySnapshot = await firestore
    .collection(`contracts`)
    .where('creatorId', '==', creator.id)
    .where('createdTime', '>=', today)
    .get()
  const isFree = userContractsCreatedTodaySnapshot.size === 0

  const ante = FIXED_ANTE

  if (
    ante === undefined ||
    ante < MINIMUM_ANTE ||
    (ante > creator.balance && !isFree) ||
    isNaN(ante) ||
    !isFinite(ante)
  )
    throw new APIError(400, 'Invalid ante')

  console.log(
    'creating contract for',
    creator.username,
    'on',
    question,
    'ante:',
    ante || 0
  )

  const slug = await getSlug(question)

  const contractRef = firestore.collection('contracts').doc()

  const contract = getNewContract(
    contractRef.id,
    slug,
    creator,
    question,
    outcomeType,
    description,
    initialProb,
    ante,
    closeTime,
    tags ?? [],
    NUMERIC_BUCKET_COUNT,
    min ?? 0,
    max ?? 0,
    manaLimitPerUser ?? 0
  )

  if (!isFree && ante) await chargeUser(creator.id, ante, true)

  await contractRef.create(contract)

  const providerId = isFree ? HOUSE_LIQUIDITY_PROVIDER_ID : creator.id

  if (outcomeType === 'BINARY' && contract.mechanism === 'dpm-2') {
    const yesBetDoc = firestore
      .collection(`contracts/${contract.id}/bets`)
      .doc()

    const noBetDoc = firestore.collection(`contracts/${contract.id}/bets`).doc()

    const { yesBet, noBet } = getAnteBets(
      creator,
      contract as FullContract<DPM, Binary>,
      yesBetDoc.id,
      noBetDoc.id
    )

    await yesBetDoc.set(yesBet)
    await noBetDoc.set(noBet)
  } else if (outcomeType === 'BINARY') {
    const liquidityDoc = firestore
      .collection(`contracts/${contract.id}/liquidity`)
      .doc()

    const lp = getCpmmInitialLiquidity(
      providerId,
      contract as FullContract<CPMM, Binary>,
      liquidityDoc.id,
      ante
    )

    await liquidityDoc.set(lp)
  } else if (outcomeType === 'FREE_RESPONSE') {
    const noneAnswerDoc = firestore
      .collection(`contracts/${contract.id}/answers`)
      .doc('0')

    const noneAnswer = getNoneAnswer(contract.id, creator)
    await noneAnswerDoc.set(noneAnswer)

    const anteBetDoc = firestore
      .collection(`contracts/${contract.id}/bets`)
      .doc()

    const anteBet = getFreeAnswerAnte(
      providerId,
      contract as FullContract<DPM, FreeResponse>,
      anteBetDoc.id
    )
    await anteBetDoc.set(anteBet)
  } else if (outcomeType === 'NUMERIC') {
    const anteBetDoc = firestore
      .collection(`contracts/${contract.id}/bets`)
      .doc()

    const anteBet = getNumericAnte(
      creator,
      contract as FullContract<DPM, Numeric>,
      ante,
      anteBetDoc.id
    )

    await anteBetDoc.set(anteBet)
  }

  return contract
})

const getSlug = async (question: string) => {
  const proposedSlug = slugify(question)

  const preexistingContract = await getContractFromSlug(proposedSlug)

  return preexistingContract
    ? proposedSlug + '-' + randomString()
    : proposedSlug
}

const firestore = admin.firestore()

export async function getContractFromSlug(slug: string) {
  const snap = await firestore
    .collection('contracts')
    .where('slug', '==', slug)
    .get()

  return snap.empty ? undefined : (snap.docs[0].data() as Contract)
}
