import { z } from 'zod'
import { APIError, authEndpoint, validate } from 'api/helpers'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { log } from 'shared/utils'
const genderType = z.union([
  z.literal('male'),
  z.literal('female'),
  z.literal('trans-female'),
  z.literal('trans-male'),
  z.literal('non-binary'),
  z.literal('other'),
])
const genderTypes = z.array(genderType)

const loveUsersSchema = z.object({
  // Required fields
  birthdate: z.string(),
  city: z.string(),
  gender: genderType,
  pref_gender: genderTypes,
  pref_age_min: z.number().min(18).max(999),
  pref_age_max: z.number().min(18).max(1000),
  pref_relation_styles: z.array(
    z.union([
      z.literal('mono'),
      z.literal('poly'),
      z.literal('open'),
      z.literal('other'),
    ])
  ),
  is_smoker: z.boolean(),
  drinks_per_month: z.number().min(0),
  is_vegetarian_or_vegan: z.boolean(),
  has_kids: z.number().min(0),
  wants_kids_strength: z.number().min(0),
})

export const createlover = authEndpoint(async (req, auth) => {
  const parsedBody = loveUsersSchema.parse(req.body)
  const db = createSupabaseClient()
  const { data: existingUser } = await db
    .from('lovers')
    .select('id')
    .eq('user_id', auth.uid)
    .single()
  if (existingUser) {
    throw new APIError(400, 'User already exists')
  }

  const { data, error } = await db
    .from('lovers')
    .insert([
      {
        ...parsedBody,
        user_id: auth.uid,
      },
    ])
    .select()

  if (error) {
    log('Error creating user', error)
    throw new APIError(500, 'Error creating user')
  }
  log('Created user', data[0])
  return {
    success: true,
    lover: data[0],
  }
})
