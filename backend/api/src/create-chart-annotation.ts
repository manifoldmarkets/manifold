import { z } from 'zod'
import { MAX_ANSWER_LENGTH } from 'common/answer'
import { APIError, authEndpoint, validate } from 'api/helpers'
import { getContractSupabase, getUser } from 'shared/utils'
import { throwErrorIfNotMod } from 'shared/helpers/auth'
import { MAX_ID_LENGTH } from 'common/group'
import { createSupabaseDirectClient } from 'shared/supabase/init'

const bodySchema = z
  .object({
    contractId: z.string().max(MAX_ID_LENGTH),
    eventTime: z.number(),

    text: z.string().min(1).max(MAX_ANSWER_LENGTH).optional(),
    commentId: z.string().optional(),
    thumbnailUrl: z.string().optional(),
    externalUrl: z.string().optional(),
  })
  .strict()

export const createchartannotation = authEndpoint(async (req, auth, log) => {
  const {
    contractId,
    text,
    commentId,
    externalUrl,
    thumbnailUrl: passedThumbnailUrl,
    eventTime,
  } = validate(bodySchema, req.body)

  const contract = await getContractSupabase(contractId)
  if (!contract) throw new APIError(404, `Contract ${contractId} not found`)
  if (contract.creatorId !== auth.uid) await throwErrorIfNotMod(auth.uid)

  const creator = await getUser(auth.uid)
  if (!creator) throw new APIError(404, 'Your account was not found')

  const thumbnailUrl =
    !passedThumbnailUrl && text ? creator.avatarUrl : passedThumbnailUrl
  log('Received chart annotation', {
    contractId,
    text,
    commentId,
    externalUrl,
    thumbnailUrl,
    eventTime,
  })

  const pg = createSupabaseDirectClient()
  const res = await pg.one(
    `
    insert into chart_annotations 
        (contract_id, event_time, text, comment_id, external_url,
         thumbnail_url, creator_id, creator_name, creator_username, creator_avatar_url)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       on conflict (id) do update set
          event_time = $2, text = $3, comment_id = $4,
          external_url = $5, thumbnail_url = $6
        returning id
        `,
    [
      contractId,
      eventTime,
      text,
      commentId,
      externalUrl,
      thumbnailUrl,
      creator.id,
      creator.name,
      creator.username,
      creator.avatarUrl,
    ]
  )

  return { success: true, id: Number(res.id) }
})
