import * as admin from 'firebase-admin'
import { sumBy } from 'lodash'
import { CPMMMultiContract, Contract, MultiContract } from 'common/contract'
import { getUser } from 'shared/utils'
import { APIError, typedEndpoint, validate } from './helpers'
import { resolveMarketHelper } from 'shared/resolve-market-helpers'
import { Answer } from 'common/answer'
import { throwErrorIfNotMod } from 'shared/helpers/auth'
import { ValidatedAPIParams } from 'common/api/schema'
import {
  resolveBinarySchema,
  resolveFRSchema,
  resolveMultiSchema,
  resolveNumericSchema,
  resolvePseudoNumericSchema,
} from 'common/api/market-types'

export const resolveMarket = typedEndpoint(
  'resolveMarket',
  async (props, auth, { log }) => {
    const { contractId } = props
    const contractDoc = firestore.doc(`contracts/${contractId}`)
    const contractSnap = await contractDoc.get()
    if (!contractSnap.exists)
      throw new APIError(404, 'No contract exists with the provided ID')
    const contract = contractSnap.data() as Contract

    let answers: Answer[] = []
    if (contract.mechanism === 'cpmm-multi-1') {
      // Denormalize answers.
      const answersSnap = await firestore
        .collection(`contracts/${contractId}/answersCpmm`)
        .get()
      answers = answersSnap.docs.map((doc) => doc.data() as Answer)
      contract.answers = answers
    }

    const { creatorId, outcomeType } = contract
    if (outcomeType === 'STONK') {
      throw new APIError(403, 'STONK contracts cannot be resolved')
    }
    const caller = await getUser(auth.uid)
    if (!caller) throw new APIError(400, 'Caller not found')
    if (creatorId !== auth.uid) await throwErrorIfNotMod(auth.uid)

    if (contract.resolution)
      throw new APIError(403, 'Contract already resolved')

    const creator = caller.id === creatorId ? caller : await getUser(creatorId)
    if (!creator) throw new APIError(500, 'Creator not found')

    const resolutionParams = getResolutionParams(contract, props)

    if ('answerId' in resolutionParams && 'answers' in contract) {
      const { answerId } = resolutionParams
      const answer = answers.find((a) => a.id === answerId)
      if (answer && 'resolution' in answer && answer.resolution) {
        throw new APIError(403, `${answerId} answer is already resolved`)
      }
    }

    log('Resolving market ', {
      contractSlug: contract.slug,
      contractId,
      resolutionParams,
    })

    await resolveMarketHelper(contract, caller, creator, resolutionParams, log)
    // TODO: return?
  }
)

function getResolutionParams(
  contract: Contract,
  props: ValidatedAPIParams<'resolveMarket'>
) {
  const { outcomeType } = contract
  if (
    outcomeType === 'BINARY' ||
    (outcomeType === 'MULTIPLE_CHOICE' &&
      contract.mechanism === 'cpmm-multi-1' &&
      !contract.shouldAnswersSumToOne)
  ) {
    const binaryParams = validate(resolveBinarySchema, props)
    if (binaryParams.answerId && outcomeType !== 'MULTIPLE_CHOICE') {
      throw new APIError(
        400,
        'answerId field is only allowed for multiple choice markets'
      )
    }
    if (binaryParams.answerId && outcomeType === 'MULTIPLE_CHOICE')
      validateAnswerCpmm(contract, binaryParams.answerId)
    return {
      ...binaryParams,
      value: undefined,
      resolutions: undefined,
    }
  } else if (outcomeType === 'NUMERIC') {
    return {
      ...validate(resolveNumericSchema, props),
      resolutions: undefined,
      probabilityInt: undefined,
    }
  } else if (outcomeType === 'PSEUDO_NUMERIC') {
    return {
      ...validate(resolvePseudoNumericSchema, props),
      resolutions: undefined,
    }
  } else if (
    outcomeType === 'MULTIPLE_CHOICE' &&
    contract.mechanism === 'cpmm-multi-1'
  ) {
    const cpmmMultiParams = validate(resolveMultiSchema, props)
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
    const freeResponseParams = validate(resolveFRSchema, props)
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
  }
  throw new APIError(400, `Invalid outcome type: ${outcomeType}`)
}

function validateAnswer(contract: MultiContract, answer: number) {
  const validIds = contract.answers.map((a) => a.id)
  if (!validIds.includes(answer.toString())) {
    throw new APIError(403, `${answer} is not a valid answer ID`)
  }
}
function validateAnswerCpmm(contract: CPMMMultiContract, answerId: string) {
  const validIds = contract.answers.map((a) => a.id)
  if (!validIds.includes(answerId)) {
    throw new APIError(403, `${answerId} is not a valid answer ID`)
  }
}

const firestore = admin.firestore()
