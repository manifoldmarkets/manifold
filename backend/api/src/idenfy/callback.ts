import { Request, Response } from 'express'
import * as crypto from 'crypto'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updateUser } from 'shared/supabase/users'
import { FieldVal } from 'shared/supabase/utils'
import { getUser, log, getContractSupabase } from 'shared/utils'
import { broadcastUpdatedPrivateUser } from 'shared/websockets/helpers'
import { runTxnFromBank } from 'shared/txn/run-txn'
import { runTransactionWithRetries } from 'shared/transact-with-retries'
import {
  LEGACY_REFERRAL_VERIFY_BONUS,
  LEGACY_VERIFIED_SIGNUP_TOP_UP,
  VERIFIED_SIGNUP_BONUS_DESCRIPTION,
} from 'common/economy'
import { SignupBonusTxn } from 'common/txn'
import { isUnderageDenial } from 'common/idenfy-helpers'
import { paysLegacyReferralHalves } from 'common/user'
import { createReferralNotification } from 'shared/create-notification'
import { payReferralBonus } from 'shared/referral-bonus'

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

const markOutdated = (reason: string) =>
  reason.endsWith(' (outdated)') ? reason : `${reason} (outdated)`

export const idenfyCallback = async (req: Request, res: Response) => {
  const callbackSecret = process.env.IDENFY_CALLBACK_SECRET

  // Get raw body - express.raw() gives us a Buffer
  const rawBody = Buffer.isBuffer(req.body)
    ? req.body.toString('utf8')
    : JSON.stringify(req.body)

  if (!callbackSecret) {
    log.error('IDENFY_CALLBACK_SECRET not configured')
    res.status(500).send('Webhook not configured')
    return
  }

  // Verify signature
  const signature = req.headers['idenfy-signature'] as string | undefined
  if (!verifySignature(rawBody, signature, callbackSecret)) {
    log.error('iDenfy callback signature verification failed')
    res.status(401).send('Unauthorized')
    return
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
  const fraudInfo =
    [...(status?.fraudTags || []), ...(status?.suspicionReasons || [])]
      .filter(Boolean)
      .join(',') || null

  // Extract AML status
  const amlStatus =
    status?.amlResultClass || payload.amlCheck?.overallStatus || null

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

  // On approval: mark the user verified (unlocks prize drawings and commenting
  // early, and clears an admin flag). Verification pays nothing for accounts
  // created since signup started paying the full bonus up front; accounts
  // created before that still get the top-up and referral half they were
  // promised. Only set to 'verified' on approval - don't overwrite
  // grandfathered status on failure.
  if (internalStatus === 'approved') {
    const user = await getUser(userId)
    if (user) {
      // An admin/superban bonus block survives approval — current, or the
      // snapshot under an admin flag. Such an account earns neither legacy
      // payout below.
      const keepsBonusBlock =
        user.bonusEligibility === 'ineligible' ||
        (user.bonusEligibility === 'requires_verification' &&
          user.previousBonusEligibility === 'ineligible')

      // Legacy accounts were created with signupBonusPaid 0 (or, much older,
      // undefined) and promised the top-up on verification. Topped-up accounts
      // hold LEGACY_VERIFIED_SIGNUP_TOP_UP; accounts created since hold the
      // full STARTING_BALANCE paid at signup.
      const owesLegacyTopUp = !keepsBonusBlock && !user.signupBonusPaid

      // Only referrals recorded before signup-time payouts have a legacy
      // verify half left to pay; skip the lookups for everyone else.
      const referrerId = user.referredByUserId
      const owesLegacyReferralHalf =
        !keepsBonusBlock &&
        !!referrerId &&
        referrerId !== userId &&
        paysLegacyReferralHalves(user)
      const referrer =
        owesLegacyReferralHalf && referrerId ? await getUser(referrerId) : null
      const referredByContract =
        referrer && user.referredByContractId
          ? await getContractSupabase(user.referredByContractId)
          : undefined

      // SERIALIZABLE isolation + retry: protects the signup-bonus and
      // referral-verify dedupe SELECTs against concurrent iDenfy webhook
      // retries (timeouts trigger retries, and the same scanRef can arrive
      // multiple times). Without this, two concurrent callbacks could both
      // miss the dedup and double-pay.
      const referralBonusAmount = await runTransactionWithRetries(
        async (tx) => {
          // Mark verified and pin prize eligibility. Pinning 'eligible'
          // (rather than leaving it unset to fall back through
          // isIdentityVerified) means an admin who later flags the user
          // bonus-ineligible doesn't accidentally also cut prize access —
          // the two axes stay decoupled once iDenfy has approved.
          //
          // An admin/superban bonus block ('ineligible') survives approval,
          // whether it's current or the snapshot under an admin flag:
          // iDenfy no longer writes it, so passing KYC must not clear it.
          // (An admin flag, 'requires_verification', is what verification
          // is meant to clear.) A blocked account's prize state is left
          // alone too — the sweepstakes endpoints gate on prize eligibility
          // alone, so pinning 'eligible' would let a superbanned account
          // that passes KYC buy tickets and claim cash. With it unset, the
          // isIdentityVerified fallback stays false for 'ineligible'.
          // Approval resolves any flag, so its snapshot is spent either way.
          await updateUser(tx, userId, {
            bonusEligibility: keepsBonusBlock ? 'ineligible' : 'verified',
            ...(keepsBonusBlock ? {} : { prizeEligibility: 'eligible' }),
            previousBonusEligibility: FieldVal.delete() as any,
            ...(user.verificationFlagReason
              ? {
                  verificationFlagReason: markOutdated(
                    user.verificationFlagReason
                  ),
                }
              : {}),
          })

          // Pay the legacy top-up if not already paid. Match on description,
          // not category alone: the next-day signup bonus shares the
          // SIGNUP_BONUS category, and a category-only check skipped this
          // payment for any user whose next-day bonus landed before iDenfy
          // approval.
          if (owesLegacyTopUp) {
            const existingSignupTxn = await tx.oneOrNone(
              `SELECT 1 FROM txns WHERE to_id = $1
             AND category = 'SIGNUP_BONUS'
             AND data->>'description' = $2`,
              [userId, VERIFIED_SIGNUP_BONUS_DESCRIPTION]
            )
            if (!existingSignupTxn) {
              const signupBonusTxn: Omit<
                SignupBonusTxn,
                'id' | 'createdTime' | 'fromId'
              > = {
                fromType: 'BANK',
                toId: userId,
                toType: 'USER',
                amount: LEGACY_VERIFIED_SIGNUP_TOP_UP,
                token: 'M$',
                category: 'SIGNUP_BONUS',
                description: VERIFIED_SIGNUP_BONUS_DESCRIPTION,
              }
              await runTxnFromBank(tx, signupBonusTxn)
              await updateUser(tx, userId, {
                signupBonusPaid: LEGACY_VERIFIED_SIGNUP_TOP_UP,
              })
              log(
                `Paid legacy signup top-up of ${LEGACY_VERIFIED_SIGNUP_TOP_UP} to user ${userId} after identity verification`
              )
            }
          }

          // Pay the legacy verify half of a pre-signup-payout referral,
          // matching the legacy first-bet half in on-create-bet.ts.
          if (!referrer) return null
          return await payReferralBonus(tx, {
            referrer,
            referredUserId: userId,
            referredContractId: referredByContract?.id,
            bonusType: 'verify',
            baseAmount: LEGACY_REFERRAL_VERIFY_BONUS,
          })
        }
      )

      // Send referral notification outside transaction
      if (referralBonusAmount && referrer) {
        await createReferralNotification(
          referrer.id,
          user,
          referralBonusAmount.toString(),
          referredByContract ?? undefined,
          'verify'
        )
      }
    }
  }

  // Handle denial / suspicion: block prize drawings only. Leave
  // bonusEligibility untouched — verification is optional, so failing an
  // attempt mustn't cost a user the bonuses every unverified account gets. An
  // admin-flagged 'requires_verification' user stays flagged; suspected fraud
  // is for admins to flag by hand. The user can retry (e.g. an under-18 at 18),
  // and a later approval re-pins prizeEligibility = 'eligible'.
  //
  // Pinning prizeEligibility = 'ineligible' is LOAD-BEARING: when it's unset,
  // canEnterPrizeDrawings falls back to isIdentityVerified, which is true for
  // a 'grandfathered' user — so without the pin, a grandfathered user who
  // failed KYC would still pass the prize fallback.
  //
  // The pin is skipped when it would be wrong rather than a real result:
  //   - EXPIRED/DELETED (which mapIdenfyStatus folds into 'denied'): an
  //     abandoned session, not a failed check.
  //   - a callback for a session that isn't the user's latest: callbacks can
  //     arrive out of order, so an old session expiring after a newer one
  //     passed must not revoke the prize access that one granted.
  //   - a user who has already passed iDenfy ('verified').
  if (internalStatus === 'denied' || internalStatus === 'suspected') {
    const user = await getUser(userId)
    const latestSession = await pg.oneOrNone<{ scan_ref: string }>(
      `SELECT scan_ref FROM idenfy_verifications
       WHERE user_id = $1
       ORDER BY created_time DESC
       LIMIT 1`,
      [userId]
    )
    const isAbandoned =
      status?.overall === 'EXPIRED' || status?.overall === 'DELETED'
    const skipReason = !user
      ? undefined
      : isAbandoned
      ? `session ${status?.overall}`
      : latestSession?.scan_ref !== scanRef
      ? 'not the latest session'
      : user.bonusEligibility === 'verified'
      ? 'already verified'
      : undefined
    if (user && skipReason) {
      log(
        `User ${userId} iDenfy ${internalStatus} ignored for prize eligibility (${skipReason})`
      )
    } else if (user) {
      await updateUser(pg, userId, {
        prizeEligibility: 'ineligible',
      })
      log(
        `User ${userId} iDenfy ${internalStatus}${
          isUnderageDenial(payload) ? ' (underage)' : ''
        } — prizes blocked, bonusEligibility unchanged (${
          user.bonusEligibility ?? 'undefined'
        })`
      )
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
