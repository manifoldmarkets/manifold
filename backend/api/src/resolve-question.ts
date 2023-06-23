import * as admin from 'firebase-admin'
import { z } from 'zod'
import { sumBy } from 'lodash'

import {
  CPMMMultiContract,
  Contract,
  MultiContract,
  RESOLUTIONS,
} from 'common/contract'
import { getUser } from 'shared/utils'
import { isAdmin, isManifoldId, isTrustworthy } from 'common/envs/constants'
import { APIError, authEndpoint, validate } from './helpers'
import { resolveQuestionHelper } from 'shared/resolve-question-helpers'
import { Answer } from 'common/answer'

const bodySchema = z.object({
  contractId: z.string(),
})

const binarySchema = z.object({
  outcome: z.enum(RESOLUTIONS),
  probabilityInt: z.number().gte(0).lte(100).optional(),
})

const freeResponseSchema = z.union([
  z.object({
    outcome: z.literal('CANCEL'),
  }),
  z.object({
    outcome: z.literal('MKT'),
    resolutions: z.array(
      z.object({
        answer: z.number().int().nonnegative(),
        pct: z.number().gte(0).lte(100),
      })
    ),
  }),
  z.object({
    outcome: z.number().int().nonnegative(),
  }),
])

const cpmmMultipleChoiceSchema = z.union([
  z.object({
    outcome: z.literal('CANCEL'),
  }),
  z.object({
    outcome: z.literal('CHOOSE_ONE'),
    answerId: z.string(),
  }),
  z.object({
    outcome: z.literal('CHOOSE_MULTIPLE'),
    resolutions: z.array(
      z.object({
        answerId: z.string(),
        pct: z.number().gte(0).lte(100),
      })
    ),
  }),
])

const numericSchema = z.object({
  outcome: z.union([z.literal('CANCEL'), z.string()]),
  value: z.number().optional(),
})

const pseudoNumericSchema = z.union([
  z.object({
    outcome: z.literal('CANCEL'),
  }),
  z.object({
    outcome: z.literal('MKT'),
    value: z.number(),
    probabilityInt: z.number().gte(0).lte(100),
  }),
])

export const resolvequestion = authEndpoint(async (req, auth) => {
  const { contractId } = validate(bodySchema, req.body)
  const contractDoc = firestore.doc(`contracts/${contractId}`)
  const contractSnap = await contractDoc.get()
  if (!contractSnap.exists)
    throw new APIError(404, 'No contract exists with the provided ID')
  const contract = contractSnap.data() as Contract

  if (contract.mechanism === 'cpmm-multi-1') {
    // Denormalize answers.
    const answersSnap = await firestore
      .collection(`contracts/${contractId}/answersCpmm`)
      .get()
    const answers = answersSnap.docs.map((doc) => doc.data() as Answer)
    contract.answers = answers
  }

  const { creatorId, outcomeType } = contract
  if (outcomeType === 'STONK') {
    throw new APIError(400, 'STONK contracts cannot be resolved')
  }
  const firebaseUser = await admin.auth().getUser(auth.uid)
  const caller = await getUser(auth.uid)

  const isClosed = !!(contract.closeTime && contract.closeTime < Date.now())
  const trustworthyResolvable = isTrustworthy(caller?.username) && isClosed

  if (
    creatorId !== auth.uid &&
    !isManifoldId(auth.uid) &&
    !isAdmin(firebaseUser.email) &&
    !trustworthyResolvable
  )
    throw new APIError(403, 'User is not creator of contract')

  if (contract.resolution) throw new APIError(400, 'Contract already resolved')

  const creator = await getUser(creatorId)
  if (!creator) throw new APIError(500, 'Creator not found')

  const resolutionParams = getResolutionParams(contract, req.body)
  return await resolveQuestionHelper(
    contract,
    caller ?? creator,
    creator,
    resolutionParams
  )
})

function getResolutionParams(contract: Contract, body: string) {
  const { outcomeType } = contract

  if (outcomeType === 'NUMERIC') {
    return {
      ...validate(numericSchema, body),
      resolutions: undefined,
      probabilityInt: undefined,
    }
  } else if (outcomeType === 'PSEUDO_NUMERIC') {
    return {
      ...validate(pseudoNumericSchema, body),
      resolutions: undefined,
    }
  } else if (
    outcomeType === 'MULTIPLE_CHOICE' &&
    contract.mechanism === 'cpmm-multi-1'
  ) {
    const cpmmMultiParams = validate(cpmmMultipleChoiceSchema, body)
    const { outcome } = cpmmMultiParams
    if (outcome === 'CANCEL') {
      return {
        outcome: 'CANCEL',
        resolutions: undefined,
        value: undefined,
        probabilityInt: undefined,
      }
    } else if (outcome === 'CHOOSE_ONE') {
      const { answerId } = cpmmMultiParams
      const resolutions = { [answerId]: 100 }
      return {
        outcome: answerId,
        resolutions,
        value: undefined,
        probabilityInt: undefined,
      }
    } else if (outcome === 'CHOOSE_MULTIPLE') {
      const { resolutions } = cpmmMultiParams
      resolutions.forEach(({ answerId }) =>
        validateAnswerCpmm(contract, answerId)
      )
      const pctSum = sumBy(resolutions, ({ pct }) => pct)
      if (Math.abs(pctSum - 100) > 0.1) {
        throw new APIError(400, 'Resolution percentages must sum to 100')
      }
      return {
        outcome,
        resolutions: Object.fromEntries(
          resolutions.map((r) => [r.answerId, r.pct])
        ),
        value: undefined,
        probabilityInt: undefined,
      }
    }
  } else if (
    outcomeType === 'FREE_RESPONSE' ||
    outcomeType === 'MULTIPLE_CHOICE'
  ) {
    const freeResponseParams = validate(freeResponseSchema, body)
    const { outcome } = freeResponseParams
    switch (outcome) {
      case 'CANCEL':
        return {
          outcome: outcome.toString(),
          resolutions: undefined,
          value: undefined,
          probabilityInt: undefined,
        }
      case 'MKT': {
        const { resolutions } = freeResponseParams
        resolutions.forEach(({ answer }) => validateAnswer(contract, answer))
        const pctSum = sumBy(resolutions, ({ pct }) => pct)
        if (Math.abs(pctSum - 100) > 0.1) {
          throw new APIError(400, 'Resolution percentages must sum to 100')
        }
        return {
          outcome: outcome.toString(),
          resolutions: Object.fromEntries(
            resolutions.map((r) => [r.answer, r.pct])
          ),
          value: undefined,
          probabilityInt: undefined,
        }
      }
      default: {
        validateAnswer(contract, outcome)
        return {
          outcome: outcome.toString(),
          resolutions: undefined,
          value: undefined,
          probabilityInt: undefined,
        }
      }
    }
  } else if (outcomeType === 'BINARY') {
    return {
      ...validate(binarySchema, body),
      value: undefined,
      resolutions: undefined,
    }
  }
  throw new APIError(500, `Invalid outcome type: ${outcomeType}`)
}

function validateAnswer(contract: MultiContract, answer: number) {
  const validIds = contract.answers.map((a) => a.id)
  if (!validIds.includes(answer.toString())) {
    throw new APIError(400, `${answer} is not a valid answer ID`)
  }
}
function validateAnswerCpmm(contract: CPMMMultiContract, answerId: string) {
  const validIds = contract.answers.map((a) => a.id)
  if (!validIds.includes(answerId)) {
    throw new APIError(400, `${answerId} is not a valid answer ID`)
  }
}

const firestore = admin.firestore()
