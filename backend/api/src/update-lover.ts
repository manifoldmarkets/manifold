import { z } from 'zod'
import { APIError, authEndpoint, validate } from 'api/helpers'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { log } from 'shared/utils'

const loveUsersSchema = z.object({
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
})

export const updatelover = authEndpoint(async (req, auth) => {
  const parsedBody = loveUsersSchema.parse(req.body)
  const db = createSupabaseClient()
  const { data: existingUser } = await db
    .from('lovers')
    .select('id')
    .eq('user_id', auth.uid)
    .single()
  if (!existingUser) {
    throw new APIError(400, 'User not found')
  }

  const { data, error } = await db
    .from('lovers')
    .update({
      ...parsedBody,
    })
    .eq('id', existingUser.id)
  if (error) {
    log('Error updating user', error)
    throw new APIError(500, 'Error updating user')
  }
  return {
    success: true,
  }
})
