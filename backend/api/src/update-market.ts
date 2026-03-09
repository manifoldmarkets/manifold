import { JSONContent } from '@tiptap/core'
import { APIError, APIHandler } from 'api/helpers/endpoint'
import { Contract } from 'common/contract'
import { isAdminId, isModId } from 'common/envs/constants'
import { DAY_MS } from 'common/util/time'
import { buildArray } from 'common/util/array'
import { removeUndefinedProps } from 'common/util/object'
import { isEmpty } from 'lodash'
import { trackPublicEvent } from 'shared/analytics'
import { trackAuditEvent } from 'shared/audit-events'
import { throwErrorIfNotMod } from 'shared/helpers/auth'
import { recordContractEdit } from 'shared/record-contract-edit'
import {
  updateContract,
  updateContractNativeColumns,
} from 'shared/supabase/contracts'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { FieldVal } from 'shared/supabase/utils'
import { anythingToRichText } from 'shared/tiptap'
import { getContract, log, revalidateContractStaticProps } from 'shared/utils'
import { onlyUsersWhoCanPerformAction } from './helpers/rate-limit'

export const updateMarket: APIHandler<'market/:contractId/update'> =
  onlyUsersWhoCanPerformAction('updateMarket', async (body, auth) => {
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
      display,
      homePageScoreAdjustment,
      homePageScoreAdjustmentDays,

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

    const isUpdatingHomePageScoreAdjustment =
      homePageScoreAdjustment !== undefined ||
      homePageScoreAdjustmentDays !== undefined

    if (isUpdatingHomePageScoreAdjustment) {
      if (!isAdminId(auth.uid) && !isModId(auth.uid)) {
        throw new APIError(
          403,
          'Only admins or mods can update the home page score adjustment'
        )
      }
      if (homePageScoreAdjustment === undefined) {
        throw new APIError(
          400,
          'Must provide homePageScoreAdjustment when updating the home page score adjustment'
        )
      }
      if (
        homePageScoreAdjustment === null &&
        homePageScoreAdjustmentDays !== undefined
      ) {
        throw new APIError(
          400,
          'Cannot provide homePageScoreAdjustmentDays when clearing the home page score adjustment'
        )
      }
      if (
        homePageScoreAdjustment !== null &&
        homePageScoreAdjustmentDays === undefined
      ) {
        throw new APIError(
          400,
          'Must provide homePageScoreAdjustmentDays when setting the home page score adjustment'
        )
      }
    }

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
      display,
      lastUpdatedTime: Date.now(),
    })
    await updateContract(pg, contractId, {
      ...update,
      coverImageUrl:
        coverImageUrl === null
          ? FieldVal.delete()
          : update.coverImageUrl || undefined,
    })
    const homePageScoreAdjustmentExpiresAt =
      homePageScoreAdjustment != null && homePageScoreAdjustmentDays != null
        ? Date.now() + homePageScoreAdjustmentDays * DAY_MS
        : null
    if (isUpdatingHomePageScoreAdjustment) {
      await updateContractNativeColumns(pg, contractId, {
        home_page_score_adjustment: homePageScoreAdjustment,
        home_page_score_adjustment_expires_at:
          homePageScoreAdjustmentExpiresAt == null
            ? null
            : new Date(homePageScoreAdjustmentExpiresAt).toISOString(),
      })
    }

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
          description,
          isUpdatingHomePageScoreAdjustment,
          homePageScoreAdjustment,
          homePageScoreAdjustmentExpiresAt ?? undefined
        ),
    }
  })

// Note: the contract data passed, which should not be the new data, is saved to the contract_edits table
export const updateMarketContinuation = async (
  contract: Contract,
  userId: string,
  visibility: string | undefined,
  closeTime: number | undefined,
  addAnswersMode: string | undefined,
  question: string | undefined,
  description: JSONContent | undefined,
  isUpdatingHomePageScoreAdjustment: boolean,
  homePageScoreAdjustment: number | null | undefined,
  homePageScoreAdjustmentExpiresAt: number | undefined
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
      homePageScoreAdjustment,
      homePageScoreAdjustmentExpiresAt,
    })
  )
  if (isUpdatingHomePageScoreAdjustment) {
    await trackAuditEvent(
      userId,
      'admin update market home page score adjustment',
      contract.id,
      undefined,
      removeUndefinedProps({
        homePageScoreAdjustment,
        homePageScoreAdjustmentExpiresAt,
      })
    )
  }
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
