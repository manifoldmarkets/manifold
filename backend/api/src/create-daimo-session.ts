import { APIError, APIHandler } from 'api/helpers/endpoint'
import { isUserBanned } from 'common/ban-utils'
import { getActiveUserBans } from 'api/helpers/rate-limit'
import { getPrivateUser, getUser, log } from 'shared/utils'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { track } from 'shared/analytics'

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
  _props,
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

  const payload = {
    destination: {
      type: 'evm',
      address: hotWalletAddress,
      chainId: BASE_CHAIN_ID,
      tokenAddress: BASE_USDC_ADDRESS,
    },
    display: {
      title: 'Buy mana with crypto',
      verb: 'Deposit',
    },
    metadata: {
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
