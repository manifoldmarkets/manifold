import { APIError, APIHandler } from 'api/helpers/endpoint'
import {
  log,
  getContractSupabase,
  revalidateContractStaticProps,
} from 'shared/utils'
import * as admin from 'firebase-admin'
import { trackPublicEvent } from 'shared/analytics'
import { throwErrorIfNotMod } from 'shared/helpers/auth'
import { removeUndefinedProps } from 'common/util/object'
import { recordContractEdit } from 'shared/record-contract-edit'
import { buildArray } from 'common/util/array'
import { anythingToRichText } from 'shared/tiptap'
import { isEmpty } from 'lodash'
import { isAdminId } from 'common/envs/constants'
import { rerankContractMetricsManually } from 'shared/helpers/user-contract-metrics'
import { broadcastUpdatedContract } from './websockets/helpers'
import {
  createSupabaseDirectClient,
} from 'shared/supabase/init'

export const updateMarket: APIHandler<'market/:contractId/update'> = async (
  body,
  auth
) => {
  const { contractId, ...fields } = body
  if (isEmpty(fields))
    throw new APIError(400, 'Must provide some change to the contract')

  const {
    visibility,
    addAnswersMode,
    closeTime,
    sort,
    question,
    coverImageUrl,
    isSpicePayout,

    description: raw,
    descriptionHtml: html,
    descriptionMarkdown: markdown,
    descriptionJson: jsonString,
  } = fields

  const description = anythingToRichText({ raw, html, markdown, jsonString })

  const contract = await getContractSupabase(contractId)
  if (!contract) throw new APIError(404, `Contract ${contractId} not found`)
  if (contract.creatorId !== auth.uid) await throwErrorIfNotMod(auth.uid)
  if (isSpicePayout !== undefined) {
    if (!isAdminId(auth.uid)) {
      throw new APIError(400, 'Only admins choose prize markets')
    }
  }

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

  await firestore.doc(`contracts/${contractId}`).update(
    removeUndefinedProps({
      question,
      coverImageUrl,
      closeTime,
      visibility,
      unlistedById: visibility === 'unlisted' ? auth.uid : undefined,
      addAnswersMode,
      sort,
      description,
      isSpicePayout,
    })
  )

  log(`updated fields: ${Object.keys(fields).join(', ')}`)

  if (question || closeTime || visibility || description) {
    await recordContractEdit(
      contract,
      auth.uid,
      buildArray([
        question && 'question',
        closeTime && 'closeTime',
        visibility && 'visibility',
        description && 'description',
      ])
    )
  }

  const continuation = async () => {
    broadcastUpdatedContract(contract)
    log(`Revalidating contract ${contract.id}.`)
    await revalidateContractStaticProps(contract)
    if (visibility) {
      await rerankContractMetricsManually(
        contract.id,
        contract.isRanked != false && visibility === 'public',
        contract.resolutionTime
      )
    }
    log(`Updating lastUpdatedTime for contract ${contract.id}.`)
    await firestore.collection('contracts').doc(contract.id).update({
      lastUpdatedTime: Date.now(),
    })

    //TODO: Now that we don't have private contracts, do we really need to update visibilities?
    if (visibility) {
      await updateContractSubcollectionsVisibility(contract.id, visibility)
    }
  }

  return {
    result: { success: true },
    continue: continuation,
  }
}

const firestore = admin.firestore()

async function updateContractSubcollectionsVisibility(
  contractId: string,
  newVisibility: 'public' | 'unlisted'
) {
  const pg = createSupabaseDirectClient()

  await pg.none(
    `update contract_bets set data = data || $1 where contract_id = $2`,
    [JSON.stringify({ visibility: newVisibility }), contractId]
  )
}
