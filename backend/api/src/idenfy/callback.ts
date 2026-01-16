import { Request, Response } from 'express'
import * as crypto from 'crypto'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updateUser } from 'shared/supabase/users'
import { log } from 'shared/utils'
import { broadcastUpdatedPrivateUser } from 'shared/websockets/helpers'

// iDenfy webhook callback payload structure
type IdenfyCallbackPayload = {
  final: boolean
  platform: string
  status: {
    overall: 'APPROVED' | 'DENIED' | 'SUSPECTED' | 'REVIEWING'
    suspicionReasons: string[]
    mismatchTags: string[]
    fraudTags: string[]
    autoDocument: string
    autoFace: string
    manualDocument: string
    manualFace: string
  }
  data: {
    docFirstName: string
    docLastName: string
    docNumber: string
    docPersonalCode: string
    docExpiry: string
    docDob: string
    docDateOfIssue: string
    docType: string
    docSex: string
    docNationality: string
    docIssuingCountry: string
    selectedCountry: string
    orgFirstName: string
    orgLastName: string
    orgNationality: string
    orgBirthPlace: string
    orgAuthority: string
    orgAddress: string
  }
  fileUrls: {
    FACE: string
    FRONT: string
    BACK: string
  }
  scanRef: string
  clientId: string
  startTime: number
  finishTime: number
  clientIp: string
  clientIpCountry: string
  clientLocation: string
}

// Convert iDenfy status to our internal status
function mapIdenfyStatus(
  overall: string
): 'pending' | 'approved' | 'denied' | 'suspected' {
  switch (overall) {
    case 'APPROVED':
      return 'approved'
    case 'DENIED':
      return 'denied'
    case 'SUSPECTED':
      return 'suspected'
    case 'REVIEWING':
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
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  )
}

export const idenfyCallback = async (req: Request, res: Response) => {
  const callbackSecret = process.env.IDENFY_CALLBACK_SECRET

  // Verify signature if secret is configured
  if (callbackSecret) {
    const signature = req.headers['idenfy-signature'] as string | undefined
    const rawBody = JSON.stringify(req.body)

    if (!verifySignature(rawBody, signature, callbackSecret)) {
      log.error('iDenfy callback signature verification failed')
      res.status(401).send('Unauthorized')
      return
    }
  }

  let payload: IdenfyCallbackPayload
  try {
    payload = req.body as IdenfyCallbackPayload
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

  // Update the verification record
  await pg.none(
    `UPDATE idenfy_verifications 
     SET status = $1,
         overall_status = $2,
         fraud_status = $3,
         aml_status = $4,
         callback_data = $5,
         updated_time = NOW()
     WHERE scan_ref = $6`,
    [
      internalStatus,
      status?.overall,
      status?.fraudTags?.join(',') || null,
      null, // AML status if available
      JSON.stringify(payload),
      scanRef,
    ]
  )

  // Update user's idenfyStatus field
  const updateData: Record<string, any> = {
    idenfyStatus: internalStatus,
  }

  // Only set verifiedTime if approved
  if (internalStatus === 'approved') {
    updateData.idenfyVerifiedTime = Date.now()
  }

  await updateUser(pg, userId, updateData)

  // Broadcast update to connected clients
  broadcastUpdatedPrivateUser(userId)

  log('iDenfy callback processed successfully:', {
    scanRef,
    userId,
    status: internalStatus,
  })

  res.status(200).send('OK')
}
