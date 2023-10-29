import { z } from 'zod'
import { APIError, authEndpoint, validate } from 'api/helpers'
import { createSupabaseClient } from 'shared/supabase/init'
import { getUser, log } from 'shared/utils'
import { addUserToGroup } from 'api/add-group-member'
import { manifoldLoveRelationshipsGroupId } from 'common/love/constants'
import { HOUR_MS } from 'common/util/time'
import * as admin from 'firebase-admin'
import { removePinnedUrlFromPhotoUrls } from 'shared/love/parse-photos'
import { getIp, track } from 'shared/analytics'
const genderType = z.union([
  z.literal('male'),
  z.literal('female'),
  z.literal('trans-female'),
  z.literal('trans-male'),
  z.literal('non-binary'),
])
const genderTypes = z.array(genderType)

export const baseLoversSchema = z.object({
  // Required fields
  birthdate: z.string(),
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
  wants_kids_strength: z.number().min(0),
  looking_for_matches: z.boolean(),
  photo_urls: z.array(z.string()),

  geodb_city_id: z.string().optional(),
  city: z.string(),
  region_code: z.string().optional(),
  country: z.string().optional(),
  city_latitude: z.number().optional(),
  city_longitude: z.number().optional(),

  pinned_url: z.string(),
})

export const createlover = authEndpoint(async (req, auth) => {
  const parsedBody = validate(baseLoversSchema, req.body)
  const db = createSupabaseClient()
  const { data: existingUser } = await db
    .from('lovers')
    .select('id')
    .eq('user_id', auth.uid)
    .single()
  if (existingUser) {
    throw new APIError(400, 'User already exists')
  }
  try {
    await addUserToGroup(manifoldLoveRelationshipsGroupId, auth.uid, auth.uid)
  } catch (e) {
    log('Error adding user to group', e)
  }
  await removePinnedUrlFromPhotoUrls(parsedBody)
  const user = await getUser(auth.uid)
  if (user && user.createdTime > Date.now() - HOUR_MS) {
    // If they just signed up for manifold via manifold.love, set their avatar to be their pinned photo
    const firestore = admin.firestore()
    await firestore.doc('users/' + auth.uid).update({
      avatarUrl: parsedBody.pinned_url,
    })
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
  const ip = getIp(req)
  await track(auth.uid, 'create lover', { username: user?.username }, { ip })

  return {
    success: true,
    lover: data[0],
  }
})
