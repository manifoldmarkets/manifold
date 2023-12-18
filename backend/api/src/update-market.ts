import { APIError, typedEndpoint, validate } from 'api/helpers'
import { getContractSupabase } from 'shared/utils'
import * as admin from 'firebase-admin'
import { trackPublicEvent } from 'shared/analytics'
import { throwErrorIfNotMod } from 'shared/helpers/auth'
import { removeUndefinedProps } from 'common/util/object'
import { recordContractEdit } from 'shared/record-contract-edit'
import { getDescriptionJson } from 'common/contract'
import { JSONContent } from '@tiptap/core'
import { updateMarketProps } from 'common/api/market-types'

export const updatemarket = typedEndpoint(
  'update-market',
  async (props, auth, { log }) => {
    const {
      contractId,
      visibility,
      addAnswersMode,
      sort,
      closeTime,
      question,
      description,
      descriptionHtml,
      descriptionJson,
      descriptionMarkdown,
    } = validate(updateMarketProps, props)
    if (
      !visibility &&
      !closeTime &&
      !addAnswersMode &&
      !sort &&
      !question &&
      !description &&
      !descriptionHtml &&
      !descriptionMarkdown &&
      !descriptionJson
    )
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
        question,
        description,
        descriptionHtml,
        descriptionJson,
        descriptionMarkdown,
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
    if (question) {
      await firestore.doc(`contracts/${contractId}`).update({
        question,
      })
      log('updated question')
    }

    let resolvedDescription: JSONContent | undefined = undefined
    if (
      description ||
      descriptionHtml ||
      descriptionMarkdown ||
      descriptionJson
    ) {
      resolvedDescription = getDescriptionJson(
        description,
        descriptionHtml,
        descriptionMarkdown,
        descriptionJson
      )
      await firestore.doc(`contracts/${contractId}`).update({
        description: resolvedDescription,
      })
      log('updated description')
    }
  }
)
const firestore = admin.firestore()
