import { z } from 'zod'
import { APIError, authEndpoint, validate } from 'api/helpers'
import { createSupabaseClient } from 'shared/supabase/init'
import { getUser, log } from 'shared/utils'
import * as admin from 'firebase-admin'
import { baseLoversSchema } from 'api/love/create-lover'
import { HOUR_MS } from 'common/util/time'
import { removePinnedUrlFromPhotoUrls } from 'shared/love/parse-photos'

const optionalLoversSchema = z.object({
  political_beliefs: z.array(z.string()).optional(),
  religious_belief_strength: z.number().optional(),
  religious_beliefs: z.string().optional(),
  ethnicity: z.array(z.string()).optional(),
  born_in_location: z.string().optional(),
  height_in_inches: z.number().optional(),
  has_pets: z.boolean().optional(),
  education_level: z.string().optional(),
  last_online_time: z.string().optional(),
  is_smoker: z.boolean().optional(),
  drinks_per_month: z.number().min(0).optional(),
  is_vegetarian_or_vegan: z.boolean().optional(),
  has_kids: z.number().min(0).optional(),
  university: z.string().optional(),
  occupation_title: z.string().optional(),
  occupation: z.string().optional(),
  company: z.string().optional(),
  comments_enabled: z.boolean().optional(),
  website: z.string().optional(),
  bio: z.string().optional(),
  twitter: z.string().optional(),
  avatar_url: z.string().optional(),
})
// TODO: make strict
const combinedLoveUsersSchema = baseLoversSchema.merge(optionalLoversSchema)

export const updatelover = authEndpoint(async (req, auth) => {
  const parsedBody = validate(combinedLoveUsersSchema, req.body)
  log('parsedBody', parsedBody)
  const db = createSupabaseClient()
  const { data: existingLover } = await db
    .from('lovers')
    .select('id')
    .eq('user_id', auth.uid)
    .single()
  if (!existingLover) {
    throw new APIError(400, 'Lover not found')
  }
  !parsedBody.last_online_time && log('Updating lover', auth.uid, parsedBody)

  await removePinnedUrlFromPhotoUrls(parsedBody)
  if (parsedBody.avatar_url) {
    const firestore = admin.firestore()
    await firestore.doc('users/' + auth.uid).update({
      avatarUrl: parsedBody.avatar_url,
    })
  }

  const { data, error } = await db
    .from('lovers')
    .update({
      ...parsedBody,
      user_id: auth.uid,
    })
    .eq('id', existingLover.id)
    .select()
  if (error) {
    log('Error updating lover', error)
    throw new APIError(500, 'Error updating lover')
  }
  return {
    success: true,
    lover: data[0],
  }
})
