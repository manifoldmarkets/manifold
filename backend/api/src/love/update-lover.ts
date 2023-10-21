import { z } from 'zod'
import { APIError, authEndpoint } from 'api/helpers'
import { createSupabaseClient } from 'shared/supabase/init'
import { log } from 'shared/utils'
import * as admin from 'firebase-admin'
import { baseLoversSchema } from 'api/love/create-lover'

const optionaLoversSchema = z.object({
  political_beliefs: z.array(z.string()).optional(),
  religious_belief_strength: z.number().optional(),
  religious_beliefs: z.array(z.string()).optional(),
  photo_urls: z.array(z.string()).optional(),
  pinned_url: z.string().optional(),
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
})

const combinedLoveUsersSchema = baseLoversSchema.merge(optionaLoversSchema)

export const updatelover = authEndpoint(async (req, auth) => {
  const parsedBody = combinedLoveUsersSchema.parse(req.body)
  log('parsedBody', parsedBody)
  const db = createSupabaseClient()
  const { data: existingUser } = await db
    .from('lovers')
    .select('id')
    .eq('user_id', auth.uid)
    .single()
  if (!existingUser) {
    throw new APIError(400, 'User not found')
  }
  !parsedBody.last_online_time && log('Updating user', auth.uid, parsedBody)

  if (parsedBody.pinned_url) {
    const firestore = admin.firestore()
    await firestore.doc('users/' + auth.uid).update({
      avatarUrl: parsedBody.pinned_url,
    })
    if (parsedBody.photo_urls) {
      parsedBody.photo_urls = parsedBody.photo_urls.filter(
        (url) => url !== parsedBody.pinned_url
      )
    }
  }

  const { data, error } = await db
    .from('lovers')
    .update({
      ...parsedBody,
    })
    .eq('id', existingUser.id)
    .select()
  if (error) {
    log('Error updating user', error)
    throw new APIError(500, 'Error updating user')
  }
  return {
    success: true,
    lover: data[0],
  }
})
