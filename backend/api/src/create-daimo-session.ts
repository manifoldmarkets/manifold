import { APIError, APIHandler } from 'api/helpers/endpoint'
import { isUserBanned } from 'common/ban-utils'
import { getActiveUserBans } from 'api/helpers/rate-limit'
import { getPrivateUser, getUser, log } from 'shared/utils'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { track } from 'shared/analytics'
import {
  OFFER_PRICE_CRYPTO,
  PAYMENT_PENDING_LOCK_MINUTES,
} from 'common/personalized-mana-offer'

const DAIMO_API_URL = 'https://api.daimo.com/v1/sessions'

// Base USDC on chain 8453
const BASE_CHAIN_ID = 8453
const BASE_USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'

type DaimoSessionResponse = {
  session: {
    sessionId: string
    clientSecret: string
    status: string
    destination: {
      type: string
      address: string
      chainId: number
      chainName: string
      tokenAddress: string
      tokenSymbol: string
    }
    display: {
      title: string
      verb: string
    }
    createdAt: number
    expiresAt: number
  }
}

type DaimoErrorResponse = {
  error: {
    type: string
    code: string
    message: string
    param?: string
  }
}

export const createDaimoSession: APIHandler<'create-daimo-session'> = async (
  props,
  auth
) => {
  const pg = createSupabaseDirectClient()

  const user = await getUser(auth.uid)
  if (!user) {
    throw new APIError(404, 'User not found')
  }

  const privateUser = await getPrivateUser(auth.uid)
  if (!privateUser) {
    throw new APIError(404, 'Private user not found')
  }

  const activeBans = await getActiveUserBans(auth.uid, pg)
  if (isUserBanned(activeBans, 'purchase')) {
    throw new APIError(403, 'User is banned from making purchases')
  }

  const apiKey = process.env.DAIMO_API_KEY
  if (!apiKey) {
    log.error('DAIMO_API_KEY not configured')
    throw new APIError(500, 'Crypto payment service not configured')
  }

  const hotWalletAddress = process.env.DAIMO_HOT_WALLET_ADDRESS
  if (!hotWalletAddress) {
    log.error('DAIMO_HOT_WALLET_ADDRESS not configured')
    throw new APIError(500, 'Crypto payment service not configured')
  }

  const { offerId } = props

  if (offerId) {
    // Atomically: verify the offer is redeemable + claim the cross-method
    // pending lock if no other payment session is already in flight for this
    // offer. Shared with createcheckoutsession so a user can't have one Stripe
    // and one Daimo session running for the same offer simultaneously.
    const claimed = await pg.oneOrNone<{ id: string }>(
      `update personalized_mana_offers
          set payment_pending_session_id = 'pending-' || gen_random_uuid()::text,
              payment_pending_at = now()
        where id = $1
          and user_id = $2
          and status = 'active'
          and expires_at > now()
          and (
            payment_pending_at is null
            or payment_pending_at < now() - ($3 || ' minutes')::interval
          )
       returning id`,
      [offerId, auth.uid, String(PAYMENT_PENDING_LOCK_MINUTES)]
    )
    if (!claimed) {
      const existing = await pg.oneOrNone<{
        status: string
        expires_at: string | null
        payment_pending_at: string | null
      }>(
        `select status, expires_at, payment_pending_at
           from personalized_mana_offers
          where id = $1 and user_id = $2`,
        [offerId, auth.uid]
      )
      if (
        existing &&
        existing.payment_pending_at &&
        new Date(existing.payment_pending_at).getTime() >
          Date.now() - PAYMENT_PENDING_LOCK_MINUTES * 60 * 1000
      ) {
        throw new APIError(
          409,
          'A checkout for this offer is already in progress. Complete or close it first.'
        )
      }
      throw new APIError(400, 'Offer not redeemable')
    }
  }

  const payload: Record<string, unknown> = {
    destination: {
      type: 'evm',
      address: hotWalletAddress,
      chainId: BASE_CHAIN_ID,
      tokenAddress: BASE_USDC_ADDRESS,
      // Per Daimo: amountUnits as a string locks the deposit to that exact
      // USDC amount so the user can't pay more or less. Use two-decimal
      // padding to match every Daimo docs example and stay defensive against
      // any future strict-validation change on their side.
      ...(offerId ? { amountUnits: OFFER_PRICE_CRYPTO.toFixed(2) } : {}),
    },
    display: offerId
      ? {
          title: 'Personalized mana sale',
          verb: 'Pay',
        }
      : {
          title: 'Buy mana with crypto',
          verb: 'Deposit',
        },
    metadata: offerId
      ? {
          userId: auth.uid,
          offerId,
        }
      : {
          userId: auth.uid,
        },
    refundAddress: hotWalletAddress,
  }

  log('Creating Daimo session for user:', auth.uid)

  const response = await fetch(DAIMO_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    let errorInfo: DaimoErrorResponse | null = null
    try {
      errorInfo = (await response.json()) as DaimoErrorResponse
    } catch {
      // Could not parse error response
    }

    log.error('Daimo session creation failed:', {
      status: response.status,
      errorType: errorInfo?.error?.type,
      errorCode: errorInfo?.error?.code,
      errorMessage: errorInfo?.error?.message,
      errorParam: errorInfo?.error?.param,
    })

    if (response.status === 401) {
      throw new APIError(500, 'Crypto payment service authentication failed')
    }

    throw new APIError(500, 'Failed to create crypto payment session')
  }

  const data = (await response.json()) as DaimoSessionResponse
  log('Daimo session created:', {
    sessionId: data.session.sessionId,
    userId: auth.uid,
  })

  if (!data.session?.sessionId || !data.session?.clientSecret) {
    log.error('Daimo response missing required fields:', data)
    throw new APIError(500, 'Invalid response from crypto payment service')
  }

  track(auth.uid, 'daimo session created', {
    sessionId: data.session.sessionId,
  })

  return {
    sessionId: data.session.sessionId,
    clientSecret: data.session.clientSecret,
  }
}
