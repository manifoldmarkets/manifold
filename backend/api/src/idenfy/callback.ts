import { Request, Response } from 'express'
import * as crypto from 'crypto'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updateUser } from 'shared/supabase/users'
import { log } from 'shared/utils'
import { broadcastUpdatedPrivateUser } from 'shared/websockets/helpers'

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
