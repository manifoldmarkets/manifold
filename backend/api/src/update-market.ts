import { APIError, APIHandler } from 'api/helpers/endpoint'
import { getContractSupabase } from 'shared/utils'
import * as admin from 'firebase-admin'
import { trackPublicEvent } from 'shared/analytics'
import { throwErrorIfNotMod } from 'shared/helpers/auth'
import { removeUndefinedProps } from 'common/util/object'
import { recordContractEdit } from 'shared/record-contract-edit'

export const updatemarket: APIHandler<'update-market'> = async (
  body,
  auth,
  { log }
) => {
  const { contractId, visibility, addAnswersMode, closeTime, sort } = body

  if (!visibility && !closeTime && !addAnswersMode && !sort)
    throw new APIError(400, 'Must provide some change to the contract')
  const contract = await getContractSupabase(contractId)
  if (!contract) throw new APIError(404, `Contract ${contractId} not found`)
  if (contract.creatorId !== auth.uid) await throwErrorIfNotMod(auth.uid)

  await trackPublicEvent(
    auth.uid,
    'update market',
    removeUndefinedProps({
      contractId,
      visibility,
      closeTime,
      addAnswersMode,
    })
  )
  if (closeTime) {
    await firestore.doc(`contracts/${contractId}`).update({
      closeTime,
    })
    log('updated close time')
    await recordContractEdit(contract, auth.uid, ['closeTime'])
  }
  if (visibility) {
    await firestore.doc(`contracts/${contractId}`).update(
      removeUndefinedProps({
        unlistedById: visibility === 'unlisted' ? auth.uid : undefined,
        visibility,
      })
    )
    log('updated visibility')
    await recordContractEdit(contract, auth.uid, ['visibility'])
  }
  if (addAnswersMode) {
    await firestore.doc(`contracts/${contractId}`).update({
      addAnswersMode,
    })
    log('updated add answers mode')
  }
  if (sort) {
    await firestore.doc(`contracts/${contractId}`).update({
      sort,
    })
    log('updated sort')
  }
}

const firestore = admin.firestore()
