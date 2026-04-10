import { APIError, APIHandler } from 'api/helpers/endpoint'
import { MINUTES_ALLOWED_TO_REFER } from 'common/user'
import { Contract } from 'common/contract'
import { createSupabaseDirectClient, SERIAL_MODE } from 'shared/supabase/init'
import { convertUser } from 'common/supabase/users'
import { first } from 'lodash'
import { log, getContractSupabase, getUser } from 'shared/utils'
import { MINUTE_MS } from 'common/util/time'
import { removeUndefinedProps } from 'common/util/object'
import { trackPublicEvent } from 'shared/analytics'
import { updateUser } from 'shared/supabase/users'

export const referUser: APIHandler<'refer-user'> = async (props, auth) => {
  const { referredByUsername, contractId } = props

  const pg = createSupabaseDirectClient()
  const referredByUser = first(
    await pg.map(
      `select * from users where username = $1`,
      [referredByUsername],
      (row) => convertUser(row)
    )
  )
  if (!referredByUser) {
    throw new APIError(404, `User ${referredByUsername} not found`)
  }
  if (referredByUser.isBannedFromPosting) {
    throw new APIError(
      404,
      `User ${referredByUsername} is banned from posting, not eligible for referral bonus`
    )
  }
  const newUser = await getUser(auth.uid)
  if (!newUser) {
    throw new APIError(401, `User ${auth.uid} not found`)
  }
  let referredByContract: Contract | undefined
  if (contractId) {
    referredByContract = await getContractSupabase(contractId)
    if (!referredByContract) {
      throw new APIError(404, `Contract ${contractId} not found`)
    }
    log(`referredByContract: ${referredByContract.slug}`)
  }
  await handleReferral(newUser.id, referredByUser.id, referredByContract)
  await trackPublicEvent(newUser.id, 'Referral', {
    referredByUserId: referredByUser.id,
    referredByContractId: contractId,
  })

  return { success: true }
}

// Records the referral relationship only. The actual bonus payment happens
// when the new user completes identity verification (in idenfy/callback.ts).
// This ensures both the referrer AND the new user must be bonus-eligible.
async function handleReferral(
  newUserId: string,
  referredByUserId: string,
  referredByContract?: Contract
) {
  const pg = createSupabaseDirectClient()
  log(`referredByUserId: ${referredByUserId}`)
  
  await pg.tx({ mode: SERIAL_MODE }, async (tx) => {
    const newUser = await getUser(newUserId, tx)
    if (!newUser) throw new APIError(500, `User ${newUserId} not found`)

    const referrer = await getUser(referredByUserId, tx)
    if (!referrer) throw new APIError(500, `Referrer ${referredByUserId} not found`)

    if (newUser.referredByUserId || newUser.referredByContractId) {
      throw new APIError(400, `User ${newUser.id} already has referral details`)
    }
    if (
      newUser.createdTime <
      Date.now() - MINUTES_ALLOWED_TO_REFER * MINUTE_MS
    ) {
      throw new APIError(400, `User ${newUser.id} is too old to be referred`)
    }

    // Record the referral relationship (bonus paid later upon verification)
    await updateUser(
      tx,
      newUserId,
      removeUndefinedProps({
        referredByUserId,
        referredByContractId: referredByContract?.id,
      })
    )

    log(`Recorded referral relationship: ${newUserId} referred by ${referredByUserId}. Bonus will be paid upon identity verification.`)
  })
}
