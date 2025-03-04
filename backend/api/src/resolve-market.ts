import { sumBy } from 'lodash'
import { HOUSE_LIQUIDITY_PROVIDER_ID } from 'common/antes'
import { Contract, MarketContract, MultiContract } from 'common/contract'
import { getContract, getUser, isProd, log } from 'shared/utils'
import { APIError, type APIHandler, validate } from './helpers/endpoint'
import { resolveMarketHelper } from 'shared/resolve-market-helpers'
import { throwErrorIfNotMod } from 'shared/helpers/auth'
import { ValidatedAPIParams } from 'common/api/schema'
import {
  resolveBinarySchema,
  resolveMultiSchema,
  resolvePseudoNumericSchema,
} from 'common/api/market-types'
import { resolveLoveMarketOtherAnswers } from 'shared/love/love-markets'
import { betsQueue } from 'shared/helpers/fn-queue'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { broadcastUserUpdates } from 'shared/supabase/users'
import { SWEEPSTAKES_MOD_IDS } from 'common/envs/constants'

export const resolveMarket: APIHandler<'market/:contractId/resolve'> = async (
  props,
  auth,
  request
) => {
  return await betsQueue.enqueueFnFirst(
    () => resolveMarketMain(props, auth, request),
    [props.contractId, auth.uid]
  )
}

export const resolveMarketMain: APIHandler<
  'market/:contractId/resolve'
> = async (props, auth) => {
  const db = createSupabaseDirectClient()

  const { contractId } = props
  const contract = await getContract(db, contractId)
  if (!contract) throw new APIError(404, 'Contract not found')

  const { creatorId, outcomeType } = contract
  if (outcomeType === 'STONK') {
    throw new APIError(403, 'STONK contracts cannot be resolved')
  }

  const caller = await getUser(auth.uid)
  if (!caller) throw new APIError(400, 'Caller not found')
  if (caller.isBannedFromPosting || caller.userDeleted)
    throw new APIError(403, 'Deleted or banned user cannot resolve markets')
  if (creatorId !== auth.uid) throwErrorIfNotMod(auth.uid)

  if (
    isProd() &&
    contract.token === 'CASH' &&
    auth.uid !== HOUSE_LIQUIDITY_PROVIDER_ID &&
    !SWEEPSTAKES_MOD_IDS.includes(auth.uid)
  ) {
    throw new APIError(
      403,
      'Only the Manifold account and approved mods can resolve sweepcash markets'
    )
  }

  if (contract.resolution) throw new APIError(403, 'Contract already resolved')

  const creator = caller.id === creatorId ? caller : await getUser(creatorId)
  if (!creator) throw new APIError(500, 'Creator not found')

  const resolutionParams = getResolutionParams(contract, props)

  if ('answerId' in resolutionParams && 'answers' in contract) {
    const { answerId } = resolutionParams
    const answer = contract.answers.find((a) => a.id === answerId)
    if (answer?.resolution) {
      throw new APIError(403, `${answerId} answer is already resolved`)
    }
  }

  log('Resolving market ', {
    contractSlug: contract.slug,
    contractId,
    resolutionParams,
  })

  if (
    contract.isLove &&
    contract.mechanism === 'cpmm-multi-1' &&
    resolutionParams.outcome === 'YES' &&
    'answerId' in resolutionParams
  ) {
    // For Love Markets:
    // When resolving one answer YES, first resolve all other answers.
    await resolveLoveMarketOtherAnswers(
      contract,
      caller,
      creator,
      resolutionParams
    )
  }

  const { userUpdates } = await resolveMarketHelper(
    contract as MarketContract,
    caller,
    creator,
    resolutionParams
  )
  return {
    result: { message: 'success' },
    continue: async () => {
      broadcastUserUpdates(userUpdates)
    },
  }
}

function getResolutionParams(
  contract: Contract,
  props: ValidatedAPIParams<'market/:contractId/resolve'>
) {
  const { outcomeType } = contract
  const isMultiChoice =
    outcomeType === 'MULTIPLE_CHOICE' || outcomeType === 'MULTI_NUMERIC'

  if (
    outcomeType === 'BINARY' ||
    (isMultiChoice && !contract.shouldAnswersSumToOne)
  ) {
    const binaryParams = validate(resolveBinarySchema, props)
    if (binaryParams.answerId && !isMultiChoice) {
      throw new APIError(
        400,
        'answerId field is only allowed for multiple choice markets'
      )
    }
    if (isMultiChoice && !binaryParams.answerId) {
      throw new APIError(
        400,
        'answerId field is required for multiple choice markets'
      )
    }
    if (binaryParams.answerId && isMultiChoice)
      validateAnswerCpmm(contract, binaryParams.answerId)
    return {
      ...binaryParams,
      value: undefined,
      resolutions: undefined,
    }
  } else if (outcomeType === 'PSEUDO_NUMERIC') {
    return {
      ...validate(resolvePseudoNumericSchema, props),
      resolutions: undefined,
    }
  } else if (isMultiChoice || outcomeType === 'NUMBER') {
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
  }
  throw new APIError(400, `Invalid outcome type: ${outcomeType}`)
}

function validateAnswerCpmm(contract: MultiContract, answerId: string) {
  const validIds = contract.answers.map((a) => a.id)
  if (!validIds.includes(answerId)) {
    throw new APIError(403, `${answerId} is not a valid answer ID`)
  }
}
