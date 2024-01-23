import { APIError, APIHandler } from 'api/helpers/endpoint'
import {
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

export const updatemarket: APIHandler<'update-market'> = async (
  body,
  auth,
  { log }
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

    description: raw,
    descriptionHtml: html,
    descriptionMarkdown: markdown,
    descriptionJson: jsonString,
  } = fields

  const description = anythingToRichText({ raw, html, markdown, jsonString })

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

  await revalidateContractStaticProps(contract)
}

const firestore = admin.firestore()
