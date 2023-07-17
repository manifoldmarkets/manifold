import * as admin from 'firebase-admin'
import { z } from 'zod'
import { APIError, authEndpoint, validate } from './helpers'
import { createCustomNotification } from 'shared/create-notification'
import { getUser } from 'shared/utils'
import { User } from 'common/user'
import {
  SupabaseDirectClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { isAdminId } from 'common/envs/constants'

async function getAllUsersPaginated(pg: SupabaseDirectClient) {
  const pageSize = 1000
  let offset = 0
  let users: User[] = []

  while (true) {
    const chunk = await pg.map(
      `select data from users limit $1 offset $2`,
      [pageSize, offset],
      (r: any) => r.data as User
    )

    if (chunk.length === 0) break

    users = [...users, ...chunk]
    offset += pageSize
  }

  return users
}

const bodySchema = z.object({
  url: z.string(),
  title: z.string(),
})

export const createannouncement = authEndpoint(async (req, auth) => {
  const pg = createSupabaseDirectClient()
  const isAdmin = isAdminId(auth.uid)
  const { title, url } = validate(bodySchema, req.body)

  if (!isAdmin) throw new APIError(403, 'Insufficient permissions.')

  const sender = await getUser(auth.uid)
  if (!sender)
    throw new APIError(400, 'No user exists with the authenticated user ID.')

  const users = await getAllUsersPaginated(pg)
  for (const user of users) {
    await createCustomNotification(user.id, title, sender, url)
  }
  return { status: 'success', message: 'Notifications sent successfully.' }
})

const firestore = admin.firestore()
