import { getPrivateUser, getUser } from 'shared/utils'
import { APIError, APIHandler } from './helpers/endpoint'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import * as admin from 'firebase-admin'

export const adminGetUserInfo: APIHandler<'get-user-info'> = async (
  body,
  auth
) => {
  const { userId } = body

  // Only admins can view user info
  throwErrorIfNotAdmin(auth.uid)

  // Get the user to verify they exist
  const user = await getUser(userId)
  if (!user) {
    throw new APIError(404, 'User not found')
  }

  // Get private user info
  const privateUser = await getPrivateUser(userId)
  if (!privateUser) {
    throw new APIError(404, 'Private user not found')
  }

  // Try to get Firebase Auth email
  let firebaseEmail: string | undefined
  try {
    const firebaseUser = await admin.auth().getUser(userId)
    firebaseEmail = firebaseUser.email
  } catch (error) {
    // Firebase user might not exist or be inaccessible
    firebaseEmail = undefined
  }

  return {
    supabaseEmail: privateUser.email,
    oldEmail: privateUser.old_e_mail,
    firebaseEmail,
    initialDeviceToken: privateUser.initialDeviceToken,
    initialIpAddress: privateUser.initialIpAddress,
  }
}
