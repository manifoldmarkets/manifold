import { z } from 'zod'
import { NextRequest, NextResponse } from 'next/server'
import { validate } from '../_validate'
import * as admin from 'firebase-admin'
import { initAdmin } from '../_firebase-utils'

export const config = {
  api: { bodyParser: true },
  runtime: 'edge',
  // Cleveland, USA, aka AWS us-east-2, is closest to our us-central (nam5) Firebase server
  regions: ['cle1'],
}

// Split "amount" of mana between all holders of the cert.
const schema = z.object({
  certId: z.string(),
  amount: z.number(),
  // Assumes 'M$' for now.
  // token: z.enum(['SHARE', 'M$']),
})
export type SwapCertReq = {
  certId: string
  amount: number
}

export default async (req: NextRequest) => {
  // extract params
  const { searchParams } = req.nextUrl
  console.log('searchParams', searchParams)
  // Convert the URLSearchParams to a plain object
  // Note that this coerces all values to strings... so maybe we need special parsing anyways
  // For now, just reinterpret the amount as a number
  const params = Object.fromEntries(searchParams)
  const swapCertReq = {
    certId: params.certId,
    amount: Number(params.amount),
  }
  initAdmin()
  const decodedToken = await admin.auth().verifyIdToken(params.idToken)
  const userId = decodedToken.uid
  console.log('userId', userId)

  // Could validate with zod too

  // TODO Next: Finish getting edge functions working for this use case?

  /**
   *
   * Braindump notes:
   * - Trying to get Edge set up, but headers seem missing for authentication
   * - NOt sure what happens to them -- https://vercel.com/docs/concepts/edge-network/headers
   * indicates some should show up but I'm not seeing any
   * - Also can't seem to receive POST? I mean, we can try passing url params instead
   * But maybe indicates this isn't the right use case for vercel?
   * - Can use urlparams, but next issue is that firestore-admin doesn't seem set
   * up for being run on v8
   */

  return NextResponse.json({ userId })
}
