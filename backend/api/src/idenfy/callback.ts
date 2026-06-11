import { Request, Response } from 'express'
import * as crypto from 'crypto'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updateUser } from 'shared/supabase/users'
import { getUser, log, getContractSupabase } from 'shared/utils'
import { broadcastUpdatedPrivateUser } from 'shared/websockets/helpers'
import { runTxnFromBank } from 'shared/txn/run-txn'
import { runTransactionWithRetries } from 'shared/transact-with-retries'
import { STARTING_BALANCE, REFERRAL_VERIFY_BONUS } from 'common/economy'
import { SignupBonusTxn } from 'common/txn'
import { isUnderageDenial } from 'common/idenfy-helpers'
import { createReferralNotification } from 'shared/create-notification'
import { removeUndefinedProps } from 'common/util/object'
import {
  getEffectiveBonusMultiplier,
  resolveEffectiveTier,
  roundTierBonus,
  SUPPORTER_ENTITLEMENT_IDS,
} from 'common/supporter-config'
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

      // SERIALIZABLE isolation + retry: protects the signup-bonus and
      // referral-verify dedupe SELECTs against concurrent iDenfy webhook
      // retries (timeouts trigger retries, and the same scanRef can arrive
      // multiple times). Without this, two concurrent callbacks could both
      // miss the dedup and double-pay.
      const { referralBonusAmount } = await runTransactionWithRetries(
        async (tx) => {
          // Update bonus eligibility and pin prize eligibility. Pinning
          // 'eligible' (rather than leaving it unset to fall back through
          // isIdentityVerified) means an admin who later flags the user
          // bonus-ineligible doesn't accidentally also cut prize access —
          // the two axes stay decoupled once iDenfy has approved.
          await updateUser(tx, userId, {
            bonusEligibility: 'verified',
            prizeEligibility: 'eligible',
            ...(user.verificationFlagReason
              ? {
                  verificationFlagReason: markOutdated(
                    user.verificationFlagReason
                  ),
                }
              : {}),
          })

          // Pay signup bonus if not already paid
          const existingSignupTxn = await tx.oneOrNone(
            `SELECT 1 FROM txns WHERE to_id = $1
           AND category = 'SIGNUP_BONUS'`,
            [userId]
          )
          if (!alreadyPaidBonus && !existingSignupTxn) {
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
            log(
              `Paid signup bonus of ${STARTING_BALANCE} to user ${userId} after identity verification`
            )
          }

          // Pay the verify portion of the referral bonus, scaled by the
          // referrer's effective tier (unverified 0.2x, verified 1x, subscribers
          // higher) — matching the first-bet portion in on-create-bet.ts. Skipped
          // only for self-referrals or if already paid for this referred user.
          if (referrerId === userId) {
            log(`Skipped referral verify bonus - self-referral for ${userId}`)
          } else if (referrerId && referrer) {
            // Legacy single-payment REFERRAL txns (data.bonusType IS NULL) already
            // covered the full bonus, so they block the new verify payout too.
            const existingReferralTxn = await tx.oneOrNone(
              `SELECT 1 FROM txns WHERE to_id = $1
             AND category = 'REFERRAL'
             AND data->'data'->>'referredUserId' = $2
             AND (data->'data'->>'bonusType' IS NULL OR data->'data'->>'bonusType' = 'verify')`,
              [referrer.id, userId]
            )

            if (!existingReferralTxn) {
              // Resolve the referrer's effective tier (subscription + verification)
              // to scale the bonus, consistent with the first-bet portion.
              const supporterEntitlementRows = await tx.manyOrNone(
                `SELECT user_id, entitlement_id, granted_time, expires_time, enabled FROM user_entitlements
               WHERE user_id = $1
               AND entitlement_id = ANY($2)
               AND enabled = true
               AND (expires_time IS NULL OR expires_time > NOW())`,
                [referrer.id, SUPPORTER_ENTITLEMENT_IDS]
              )
              const entitlements =
                supporterEntitlementRows.map(convertEntitlement)
              const referrerTier = resolveEffectiveTier({
                entitlements,
                bonusEligibility: referrer.bonusEligibility,
              })
              const referralMultiplier = getEffectiveBonusMultiplier(
                referrerTier,
                'referral'
              )
              const referralAmount = roundTierBonus(
                REFERRAL_VERIFY_BONUS * referralMultiplier
              )

              if (referralAmount <= 0) {
                log(
                  `Skipped referral verify bonus for referrer ${referrer.id} - effective tier ${referrerTier} (multiplier ${referralMultiplier})`
                )
              } else {
                const txnData = {
                  fromType: 'BANK',
                  toId: referrer.id,
                  toType: 'USER',
                  amount: referralAmount,
                  token: 'M$',
                  category: 'REFERRAL',
                  description: `Referral verify bonus for new user ${userId}: ${referralAmount}`,
                  data: removeUndefinedProps({
                    referredUserId: userId,
                    referredContractId: referredByContract?.id,
                    bonusType: 'verify',
                    effectiveTier: referrerTier,
                    supporterBonus: referralMultiplier > 1,
                    referralMultiplier,
                  }),
                } as const

                await runTxnFromBank(tx, txnData)
                log(
                  `Paid referral verify bonus of ${referralAmount} to referrer ${referrer.id} for verified user ${userId}`
                )
                return { referralBonusAmount: referralAmount }
              }
            }
          }

          return { referralBonusAmount: null }
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

  // Handle denial / suspicion. Two sub-cases:
  //   (a) Underage denial — user has a valid ID but is under 18. The
  //       motivating case for the prize/bonus split: block prize drawings for
  //       now, while leaving the bonus axis unchanged. They can retry identity
  //       verification for prize access once they turn 18.
  //   (b) Generic denial / suspicion — block bonuses AND explicitly pin
  //       prizeEligibility = 'ineligible'. The pin is required, not just
  //       belt-and-suspenders: a 'grandfathered' user (whom we keep
  //       grandfathered) is identity-verified for the prize fallback, so
  //       without the pin they'd still pass canEnterPrizeDrawings.
  if (internalStatus === 'denied' || internalStatus === 'suspected') {
    const user = await getUser(userId)
    if (user) {
      const isUnderage = isUnderageDenial(payload)

      if (isUnderage) {
        // Under-18: only block prize access. Leave bonusEligibility entirely
        // untouched — this preserves the original problem we set out to
        // solve (a grandfathered/verified user later discovered to be a
        // minor keeps their mana bonuses) without the side effect of
        // upgrading a brand-new user from 'undefined' to 'verified' just
        // because they failed the age gate. A new under-18 user gets no prize
        // drawing access and can retry verification at 18; an existing
        // bonus-eligible user keeps their bonus access; a flagged
        // 'requires_verification' user stays flagged for admin review.
        await updateUser(pg, userId, {
          prizeEligibility: 'ineligible',
        })
        log(
          `User ${userId} flagged underage via iDenfy — prizes blocked, bonusEligibility unchanged (${
            user.bonusEligibility ?? 'undefined'
          })`
        )
      } else {
        // Generic denial: block bonuses (preserves grandfathered, the
        // pre-existing exception). Pinning prizeEligibility='ineligible' is
        // LOAD-BEARING, not just defensive: when prizeEligibility is unset,
        // canEnterPrizeDrawings falls back to isIdentityVerified, which is true
        // for a 'grandfathered' user — and we deliberately keep them
        // grandfathered below. Without the explicit pin, a grandfathered user
        // who failed KYC would still pass the prize fallback.
        const update: Record<string, unknown> = {
          prizeEligibility: 'ineligible',
        }
        if (user.bonusEligibility !== 'grandfathered') {
          update.bonusEligibility = 'ineligible'
        }
        await updateUser(pg, userId, update as any)
        log(
          `User ${userId} iDenfy ${internalStatus} — prizes blocked${
            user.bonusEligibility !== 'grandfathered'
              ? ', bonuses blocked'
              : ', grandfathered bonus status preserved'
          }`
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
