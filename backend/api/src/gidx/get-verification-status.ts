import { getIdentityVerificationDocuments } from 'api/gidx/get-verification-documents'
import { APIHandler } from 'api/helpers/endpoint'
import { GIDXCustomerProfile } from 'common/gidx/gidx'
import { User } from 'common/user'
import { distributeKycBonus } from 'shared/distribute-kyc-bonus'
import {
  getGIDXCustomerProfile,
  getUserRegistrationRequirements,
  throwIfIPNotWhitelisted,
  verifyReasonCodes,
} from 'shared/gidx/helpers'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { updateUser } from 'shared/supabase/users'
import { getUserAndPrivateUserOrThrow, log } from 'shared/utils'

export const getVerificationStatus: APIHandler<
  'get-verification-status-gidx'
> = async (_, auth) => {
  const customerProfile = await getGIDXCustomerProfile(auth.uid)
  throwIfIPNotWhitelisted(
    customerProfile.ResponseCode,
    customerProfile.ResponseMessage
  )
  return await getVerificationStatusInternal(auth.uid, customerProfile)
}

export const getVerificationStatusInternal = async (
  userId: string,
  customerProfile: GIDXCustomerProfile
) => {
  await getUserRegistrationRequirements(userId)
  const {
    ReasonCodes,
    ResponseMessage,
    ResponseCode,
    FraudConfidenceScore,
    IdentityConfidenceScore,
  } = customerProfile
  throwIfIPNotWhitelisted(ResponseCode, ResponseMessage)
  const pg = createSupabaseDirectClient()
  const userAndPrivateUser = await getUserAndPrivateUserOrThrow(userId, pg)
  const { user } = userAndPrivateUser
  if (ResponseCode === 501 && ResponseMessage.includes('not found')) {
    log('User not found in GIDX', { userId, ResponseMessage })
    // TODO: broadcast this user update when we have that functionality
    await pg.none(
      `update users set data = data - 'kycDocumentStatus' - 'sweepstakesVerified' - 'idVerified'
             where id = $1`,
      [userId]
    )
    await pg.none(
      `update private_users set data = data - 'kycFlags'
             where id = $1`,
      [userId]
    )
    return {
      status: 'error',
      message: 'User not found in GIDX',
    }
  }

  const { status, message, idVerified } = await verifyReasonCodes(
    userAndPrivateUser,
    ReasonCodes,
    FraudConfidenceScore,
    IdentityConfidenceScore
  )

  // If they just got verified via their id documents, distribute the bonus
  if (status !== 'error' && !user.idVerified && idVerified) {
    await distributeKycBonus(pg, user)
    await updateUser(pg, user.id, {
      sweepstakesVerifiedTime: Date.now(),
    })
  }

  const { documents, status: documentStatus } = await assessDocumentStatus(
    user,
    pg
  )

  return {
    message,
    status,
    documentStatus,
    documents,
  }
}

export const assessDocumentStatus = async (
  user: User,
  pg: SupabaseDirectClient
) => {
  const {
    documents,
    rejectedDocuments,
    unrejectedUtilityDocuments,
    unrejectedIdDocuments,
    isPending,
    isVerified,
    isRejected,
  } = await getIdentityVerificationDocuments(user.id)

  if (isVerified && user.kycDocumentStatus !== 'verified') {
    // They passed the reason codes and have the required documents
    await updateUser(pg, user.id, {
      kycDocumentStatus: 'verified',
    })
  } else if (isPending && user.kycDocumentStatus !== 'pending') {
    await updateUser(pg, user.id, {
      kycDocumentStatus: 'pending',
    })
  } else if (
    isRejected &&
    documents.length &&
    user.kycDocumentStatus !== 'fail'
  ) {
    await updateUser(pg, user.id, {
      kycDocumentStatus: 'fail',
    })
  } else if (
    !documents.length &&
    user.kycDocumentStatus !== 'await-documents'
  ) {
    await updateUser(pg, user.id, {
      kycDocumentStatus: 'await-documents',
    })
  }

  return {
    status: 'success',
    documents,
    rejectedDocuments,
    unrejectedUtilityDocuments,
    unrejectedIdDocuments,
    isPending,
    isVerified,
    isRejected,
  }
}
