import { APIError, APIHandler } from 'api/helpers/endpoint'
import { log, revalidateContractStaticProps, getContract } from 'shared/utils'
import { trackPublicEvent } from 'shared/analytics'
import { throwErrorIfNotMod } from 'shared/helpers/auth'
import { removeUndefinedProps } from 'common/util/object'
import { recordContractEdit } from 'shared/record-contract-edit'
import { buildArray } from 'common/util/array'
import { anythingToRichText } from 'shared/tiptap'
import { isEmpty } from 'lodash'
import { isAdminId } from 'common/envs/constants'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updateContract } from 'shared/supabase/contracts'
import { Contract } from 'common/contract'
import { JSONContent } from '@tiptap/core'

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

    description: raw,
    descriptionHtml: html,
    descriptionMarkdown: markdown,
    descriptionJson: jsonString,
  } = fields

  const description = anythingToRichText({ raw, html, markdown, jsonString })
  const pg = createSupabaseDirectClient()
  const contract = await getContract(pg, contractId)
  if (!contract) throw new APIError(404, `Contract ${contractId} not found`)
  if (contract.creatorId !== auth.uid) throwErrorIfNotMod(auth.uid)

  if (contract.isResolved && closeTime !== undefined) {
    throw new APIError(403, 'Cannot update closeTime for resolved contracts')
  }

  if (
    contract.siblingContractId &&
    (description != undefined || question != undefined) &&
    !isAdminId(auth.uid) &&
    contract.creatorId !== auth.uid
  ) {
    throw new APIError(
      403,
      'Only Manifold team or the question creator can update title/description of sweepcash questions'
    )
  }

  const update = removeUndefinedProps({
    question,
    coverImageUrl,
    closeTime,
    visibility,
    unlistedById: visibility === 'unlisted' ? auth.uid : undefined,
    addAnswersMode,
    sort,
    description,
    lastUpdatedTime: Date.now(),
  })
  await updateContract(pg, contractId, {
    ...update,
    coverImageUrl: update.coverImageUrl || undefined,
  })

  log(`updated fields: ${Object.keys(fields).join(', ')}`)

  return {
    result: { success: true },
    continue: async () =>
      updateMarketContinuation(
        contract,
        auth.uid,
        visibility,
        closeTime,
        addAnswersMode,
        question,
        description
      ),
  }
}

// Note: the contract data passed, which should not be the new data, is saved to the contract_edits table
export const updateMarketContinuation = async (
  contract: Contract,
  userId: string,
  visibility: string | undefined,
  closeTime: number | undefined,
  addAnswersMode: string | undefined,
  question: string | undefined,
  description: JSONContent | undefined
) => {
  log(`Revalidating contract ${contract.id}.`)
  await revalidateContractStaticProps(contract)
  await trackPublicEvent(
    userId,
    'update market',
    removeUndefinedProps({
      contractId: contract.id,
      visibility,
      closeTime,
      addAnswersMode,
    })
  )
  if (question || closeTime || visibility || description) {
    await recordContractEdit(
      contract,
      userId,
      buildArray([
        question && 'question',
        closeTime && 'closeTime',
        visibility && 'visibility',
        description && 'description',
      ])
    )
  }
}
