import { Request, Response } from 'express'
import * as crypto from 'crypto'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updateUser } from 'shared/supabase/users'
import { getUser, log, getContractSupabase } from 'shared/utils'
import { broadcastUpdatedPrivateUser } from 'shared/websockets/helpers'
import { runTxnFromBank } from 'shared/txn/run-txn'
import { STARTING_BALANCE, REFERRAL_AMOUNT } from 'common/economy'
import { SignupBonusTxn } from 'common/txn'
import { canReceiveBonuses } from 'common/user'
import { createReferralNotification } from 'shared/create-notification'
import { removeUndefinedProps } from 'common/util/object'
import { getBenefit, SUPPORTER_ENTITLEMENT_IDS } from 'common/supporter-config'
import { convertEntitlement } from 'common/shop/types'

// iDenfy webhook callback payload structure (comprehensive type based on their schema)
type IdenfyCallbackPayload = {
  final: boolean
  platform: 'PC' | 'MOBILE' | 'TABLET' | 'MOBILE_APP' | 'MOBILE_SDK' | 'OTHER'
  status: {
    overall:
      | 'APPROVED'
      | 'DENIED'
      | 'SUSPECTED'
      | 'REVIEWING'
      | 'EXPIRED'
      | 'ACTIVE'
      | 'DELETED'
      | 'ARCHIVED'
    suspicionReasons: string[]
    denyReasons: string[]
    fraudTags: string[]
    mismatchTags: string[]
    autoFace: string
    manualFace: string
    autoDocument: string
    manualDocument: string
    additionalSteps: 'VALID' | 'INVALID' | 'NOT_FOUND' | null
    amlResultClass:
      | 'NOT_CHECKED'
      | 'NO_FLAGS'
      | 'FALSE_POSITIVE'
      | 'TRUE_POSITIVE'
      | 'FLAGS_FOUND'
      | null
    pepsStatus:
      | 'NOT_CHECKED'
      | 'NO_FLAGS'
      | 'FALSE_POSITIVE'
      | 'TRUE_POSITIVE'
      | 'FLAGS_FOUND'
      | null
    sanctionsStatus:
      | 'NOT_CHECKED'
      | 'NO_FLAGS'
      | 'FALSE_POSITIVE'
      | 'TRUE_POSITIVE'
      | 'FLAGS_FOUND'
      | null
    adverseMediaStatus:
      | 'NOT_CHECKED'
      | 'NO_FLAGS'
      | 'FALSE_POSITIVE'
      | 'TRUE_POSITIVE'
      | 'FLAGS_FOUND'
      | null
  }
  data: {
    docFirstName: string | null
    docLastName: string | null
    docNumber: string | null
    docPersonalCode: string | null
    docExpiry: string | null
    docDob: string | null
    docDateOfIssue: string | null
    docType: string | null
    docSex: 'MALE' | 'FEMALE' | 'UNDEFINED' | null
    docNationality: string | null
    docIssuingCountry: string | null
    selectedCountry: string | null
    orgFirstName: string | null
    orgLastName: string | null
    orgNationality: string | null
    orgBirthPlace: string | null
    orgAuthority: string | null
    orgAddress: string | null
    fullName: string | null
    ageEstimate: string | null
    clientIpProxyRiskLevel: string | null
    duplicateFaces: string[] | null
    duplicateDocFaces: string[] | null
  }
  fileUrls: Record<string, string> | null
  additionalStepPdfUrls: Record<string, string> | null
  AML: unknown[] | null
  amlCheck: {
    id: string | null
    overallStatus: string | null
  } | null
  LID: unknown[] | null
  CRIMINAL_CHECK: unknown[] | null
  scanRef: string
  externalRef: string | null
  clientId: string
  companyId: string
  beneficiaryId: string
  startTime: number
  finishTime: number
  clientIp: string | null
  clientIpCountry: string | null
  clientLocation: string | null
  gdcMatch: boolean | null
  manualAddress: string | null
  manualAddressMatch: boolean
  additionalData: Record<string, unknown> | null
  riskAssessment: {
    riskScore: number | null
    riskLevel: string | null
  } | null
}

// Convert iDenfy status to our internal status
function mapIdenfyStatus(
  overall: string
): 'pending' | 'approved' | 'denied' | 'suspected' {
  switch (overall) {
    case 'APPROVED':
      return 'approved'
    case 'DENIED':
    case 'EXPIRED':
    case 'DELETED':
      return 'denied'
    case 'SUSPECTED':
      return 'suspected'
    case 'REVIEWING':
    case 'ACTIVE':
    case 'ARCHIVED':
    default:
      return 'pending'
  }
}

// Verify the webhook signature from iDenfy
function verifySignature(
  payload: string,
  signature: string | undefined,
  secret: string
): boolean {
  if (!signature) {
    return false
  }
  const hmac = crypto.createHmac('sha256', secret)
  hmac.update(payload)
  const expectedSignature = hmac.digest('hex')
  
  // Ensure both buffers are same length for timingSafeEqual
  const sigBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expectedSignature)
  
  if (sigBuffer.length !== expectedBuffer.length) {
    return false
  }
  
  return crypto.timingSafeEqual(
    new Uint8Array(sigBuffer),
    new Uint8Array(expectedBuffer)
  )
}

export const idenfyCallback = async (req: Request, res: Response) => {
  const callbackSecret = process.env.IDENFY_CALLBACK_SECRET

  // Get raw body - express.raw() gives us a Buffer
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body)

  // Verify signature if secret is configured
  if (callbackSecret) {
    const signature = req.headers['idenfy-signature'] as string | undefined

    if (!verifySignature(rawBody, signature, callbackSecret)) {
      log.error('iDenfy callback signature verification failed')
      res.status(401).send('Unauthorized')
      return
    }
  }

  let payload: IdenfyCallbackPayload
  try {
    // Parse the raw body as JSON
    payload = JSON.parse(rawBody) as IdenfyCallbackPayload
  } catch (e) {
    log.error('Failed to parse iDenfy callback body', { error: e })
    res.status(400).send('Invalid request body')
    return
  }

  const { scanRef, clientId, status, final } = payload

  log('iDenfy callback received:', {
    scanRef,
    clientId,
    overall: status?.overall,
    final,
  })

  if (!scanRef) {
    log.error('iDenfy callback missing scanRef')
    res.status(400).send('Missing scanRef')
    return
  }

  const pg = createSupabaseDirectClient()

  // Find the verification record by scanRef
  const verification = await pg.oneOrNone<{ user_id: string }>(
    `SELECT user_id FROM idenfy_verifications WHERE scan_ref = $1`,
    [scanRef]
  )

  if (!verification) {
    log.error('iDenfy callback: verification not found', { scanRef })
    // Return 200 to prevent iDenfy from retrying for unknown scanRefs
    res.status(200).send('OK')
    return
  }

  const userId = verification.user_id
  const internalStatus = mapIdenfyStatus(status?.overall)

  // Extract fraud-related information
  const fraudInfo = [
    ...(status?.fraudTags || []),
    ...(status?.suspicionReasons || []),
  ]
    .filter(Boolean)
    .join(',') || null

  // Extract AML status
  const amlStatus = status?.amlResultClass || payload.amlCheck?.overallStatus || null

  // Extract deny reasons
  const denyReasons = status?.denyReasons?.filter(Boolean).join(',') || null

  // Update the verification record
  await pg.none(
    `UPDATE idenfy_verifications 
     SET status = $1,
         overall_status = $2,
         fraud_status = $3,
         aml_status = $4,
         deny_reasons = $5,
         callback_data = $6,
         updated_time = NOW()
     WHERE scan_ref = $7`,
    [
      internalStatus,
      status?.overall,
      fraudInfo,
      amlStatus,
      denyReasons,
      JSON.stringify(payload),
      scanRef,
    ]
  )

  // Update user's bonusEligibility if approved and pay signup bonus + referral bonus
  // Only set to 'verified' on approval - don't overwrite grandfathered status on failure
  if (internalStatus === 'approved') {
    const user = await getUser(userId)
    if (user) {
      // Only pay signup bonus if they haven't already received it
      const alreadyPaidBonus = (user.signupBonusPaid ?? 0) >= STARTING_BALANCE
      
      // Check for referral bonus eligibility
      const referrerId = user.referredByUserId
      const referrer = referrerId ? await getUser(referrerId) : null
      const referredByContract = user.referredByContractId
        ? await getContractSupabase(user.referredByContractId)
        : undefined
      
      const { referralBonusAmount } = await pg.tx(async (tx) => {
        // Update bonus eligibility
        await updateUser(tx, userId, { bonusEligibility: 'verified' })
        
        // Pay signup bonus if not already paid
        if (!alreadyPaidBonus) {
          const signupBonusTxn: Omit<
            SignupBonusTxn,
            'id' | 'createdTime' | 'fromId'
          > = {
            fromType: 'BANK',
            toId: userId,
            toType: 'USER',
            amount: STARTING_BALANCE,
            token: 'M$',
            category: 'SIGNUP_BONUS',
            description: 'Signup bonus (identity verified)',
          }
          await runTxnFromBank(tx, signupBonusTxn)
          await updateUser(tx, userId, { signupBonusPaid: STARTING_BALANCE })
          log(`Paid signup bonus of ${STARTING_BALANCE} to user ${userId} after identity verification`)
        }
        
        // Pay referral bonus if:
        // 1. User was referred by someone
        // 2. Referrer can receive bonuses (verified or grandfathered)
        // 3. Referral bonus hasn't already been paid for this user
        if (referrerId && referrer && canReceiveBonuses(referrer)) {
          // Check if referral bonus was already paid
          const existingReferralTxn = await tx.oneOrNone(
            `SELECT 1 FROM txns WHERE to_id = $1
             AND category = 'REFERRAL'
             AND data->>'referredUserId' = $2`,
            [referrer.id, userId]
          )
          
          if (!existingReferralTxn) {
            // Fetch referrer's supporter entitlements for bonus multiplier
            const supporterEntitlementRows = await tx.manyOrNone(
              `SELECT user_id, entitlement_id, granted_time, expires_time, enabled FROM user_entitlements
               WHERE user_id = $1
               AND entitlement_id = ANY($2)
               AND enabled = true
               AND (expires_time IS NULL OR expires_time > NOW())`,
              [referrer.id, SUPPORTER_ENTITLEMENT_IDS]
            )
            
            // Convert to UserEntitlement format for getBenefit
            const entitlements = supporterEntitlementRows.map(convertEntitlement)
            
            // Get tier-specific referral multiplier (1x for non-supporters)
            const referralMultiplier = getBenefit(entitlements, 'referralMultiplier')
            const referralAmount = Math.floor(REFERRAL_AMOUNT * referralMultiplier)
            
            const txnData = {
              fromType: 'BANK',
              toId: referrer.id,
              toType: 'USER',
              amount: referralAmount,
              token: 'M$',
              category: 'REFERRAL',
              description: `Referred new user id: ${userId} for ${referralAmount}`,
              data: removeUndefinedProps({
                referredUserId: userId,
                referredContractId: referredByContract?.id,
                supporterBonus: referralMultiplier > 1,
                referralMultiplier,
              }),
            } as const
            
            await runTxnFromBank(tx, txnData)
            log(`Paid referral bonus of ${referralAmount} to referrer ${referrer.id} for verified user ${userId}`)
            return { referralBonusAmount: referralAmount }
          }
        } else if (referrer && !canReceiveBonuses(referrer)) {
          log(`Skipped referral bonus for referrer ${referrer.id} - not eligible for bonuses`)
        }
        
        return { referralBonusAmount: null }
      })
      
      // Send referral notification outside transaction
      if (referralBonusAmount && referrer) {
        await createReferralNotification(
          referrer.id,
          user,
          referralBonusAmount.toString(),
          referredByContract ?? undefined
        )
      }
    }
  }

  // Broadcast update to connected clients
  broadcastUpdatedPrivateUser(userId)

  log('iDenfy callback processed successfully:', {
    scanRef,
    userId,
    status: internalStatus,
  })

  res.status(200).send('OK')
}
