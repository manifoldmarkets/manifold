import { APIError, APIHandler } from 'api/helpers/endpoint'
import { getActiveUserBans } from 'api/helpers/rate-limit'
import { isUserBanned } from 'common/ban-utils'
import {
  CRYPTO_BULK_PURCHASE_BONUS_PCT,
  CRYPTO_BULK_THRESHOLD_INTERNAL,
  CRYPTO_FIRST_PURCHASE_BONUS_PCT,
} from 'common/economy'
import {
  getMexasPurchaseMessage,
  MEXAS_MANA_PER_TOKEN,
  MEXAS_PUBLIC_RPC_URL,
  MEXAS_TOKEN,
} from 'common/crypto/mexas'
import { trackPublicEvent } from 'shared/analytics'
import { sendThankYouEmail } from 'shared/emails'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updateUser } from 'shared/supabase/users'
import { runTxnInBetQueue } from 'shared/txn/run-txn'
import { getPrivateUser, getUser, log } from 'shared/utils'
import { verifyMessage, type Address, type Hex } from 'viem'

const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

type RpcResponse<T> = {
  result?: T
  error?: { code: number; message: string }
}

type TransactionReceipt = {
  transactionHash: string
  status?: string
  logs: Array<{
    address: string
    topics: string[]
    data: string
  }>
}

function normalizeAddress(address: string) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new APIError(400, 'Invalid address')
  }
  return address.toLowerCase()
}

function addressTopic(address: string) {
  return `0x${'0'.repeat(24)}${normalizeAddress(address).slice(2)}`
}

function unitsToTokenAmount(units: number) {
  return units / 10 ** MEXAS_TOKEN.decimals
}

function parseTokenUnits(data: string) {
  const units = parseInt(data, 16)
  if (!Number.isSafeInteger(units)) {
    throw new APIError(400, 'MEXAS transfer amount is too large')
  }
  return units
}

async function arbitrumRpc<T>(method: string, params: unknown[]): Promise<T> {
  const rpcUrl = process.env.ARBITRUM_RPC_URL ?? MEXAS_PUBLIC_RPC_URL
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params,
    }),
  })

  if (!response.ok) {
    log.error('Arbitrum RPC request failed', {
      status: response.status,
      statusText: response.statusText,
    })
    throw new APIError(500, 'Arbitrum RPC request failed')
  }

  const json = (await response.json()) as RpcResponse<T>
  if (json.error) {
    log.error('Arbitrum RPC returned an error', json.error)
    throw new APIError(500, 'Arbitrum RPC returned an error')
  }

  return json.result as T
}

async function getTransactionReceipt(txHash: string) {
  return arbitrumRpc<TransactionReceipt | null>('eth_getTransactionReceipt', [
    txHash,
  ])
}

function getMexasTransferUnits(
  receipt: TransactionReceipt,
  payerAddress: string,
  treasuryAddress: string
) {
  const tokenAddress = normalizeAddress(MEXAS_TOKEN.address)
  const fromTopic = addressTopic(payerAddress)
  const toTopic = addressTopic(treasuryAddress)

  return receipt.logs.reduce((sum, event) => {
    if (normalizeAddress(event.address) !== tokenAddress) return sum
    if ((event.topics[0] ?? '').toLowerCase() !== TRANSFER_TOPIC) return sum
    if ((event.topics[1] ?? '').toLowerCase() !== fromTopic) return sum
    if ((event.topics[2] ?? '').toLowerCase() !== toTopic) return sum
    if (!/^0x[a-fA-F0-9]+$/.test(event.data)) return sum

    return sum + parseTokenUnits(event.data)
  }, 0)
}

export const recordMexasPurchase: APIHandler<'record-mexas-purchase'> = async (
  props,
  auth
) => {
  const pg = createSupabaseDirectClient()
  const userId = auth.uid

  const user = await getUser(userId)
  if (!user) {
    throw new APIError(404, 'User not found')
  }

  const activeBans = await getActiveUserBans(userId, pg)
  if (isUserBanned(activeBans, 'purchase')) {
    throw new APIError(403, 'User is banned from making purchases')
  }

  const treasuryAddress = process.env.MEXAS_TREASURY_WALLET_ADDRESS
  if (!treasuryAddress) {
    log.error('MEXAS_TREASURY_WALLET_ADDRESS not configured')
    throw new APIError(500, 'MEXAS treasury wallet not configured')
  }

  const normalizedPayer = normalizeAddress(props.payerAddress)
  const normalizedTreasury = normalizeAddress(treasuryAddress)
  const txHash = props.txHash.toLowerCase()
  const signature = props.signature.toLowerCase()

  let signatureValid = false
  try {
    signatureValid = await verifyMessage({
      address: normalizedPayer as Address,
      message: getMexasPurchaseMessage(userId, txHash, normalizedPayer),
      signature: signature as Hex,
    })
  } catch {
    signatureValid = false
  }

  if (!signatureValid) {
    throw new APIError(403, 'MEXAS payer wallet signature is invalid')
  }

  const receipt = await getTransactionReceipt(txHash)

  if (!receipt) {
    throw new APIError(
      400,
      'MEXAS transaction is not confirmed yet. Wait for Arbitrum confirmation and try again.'
    )
  }

  if (receipt.status !== '0x1') {
    throw new APIError(400, 'MEXAS transaction failed on-chain')
  }

  const mexasUnits = getMexasTransferUnits(
    receipt,
    normalizedPayer,
    normalizedTreasury
  )

  if (mexasUnits <= 0) {
    throw new APIError(
      400,
      'Transaction does not contain a MEXAS transfer from this wallet to the configured treasury.'
    )
  }

  let mexasAmount = unitsToTokenAmount(mexasUnits)
  let finalManaAmount = 0
  let bonusAmount = 0
  let isFirstCryptoPurchase = false
  let isBulkPurchase = false
  let alreadyProcessed = false

  const paidInCents = Math.round(mexasAmount * 100)
  const intentId = `mexas:${txHash}`

  await pg.tx(async (tx) => {
    const existingIntent = await tx.oneOrNone<{
      mana_amount: number | null
      usdc_amount: string | null
    }>(
      `SELECT mana_amount, usdc_amount FROM crypto_payment_intents WHERE intent_id = $1`,
      [intentId]
    )

    if (existingIntent) {
      alreadyProcessed = true
      finalManaAmount = existingIntent.mana_amount ?? 0
      mexasAmount = existingIntent.usdc_amount
        ? Number(existingIntent.usdc_amount)
        : mexasAmount
      return
    }

    const existingPurchase = await tx.oneOrNone<{ count: string }>(
      `SELECT COUNT(*) as count FROM crypto_payment_intents WHERE user_id = $1`,
      [userId]
    )
    isFirstCryptoPurchase =
      !existingPurchase || parseInt(existingPurchase.count) === 0
    isBulkPurchase = mexasAmount >= CRYPTO_BULK_THRESHOLD_INTERNAL

    let bonusPct = 0
    if (isFirstCryptoPurchase) bonusPct += CRYPTO_FIRST_PURCHASE_BONUS_PCT
    if (isBulkPurchase) bonusPct += CRYPTO_BULK_PURCHASE_BONUS_PCT

    const baseAmount = Math.floor(mexasAmount * MEXAS_MANA_PER_TOKEN)
    bonusAmount = Math.floor(baseAmount * bonusPct)
    finalManaAmount = baseAmount + bonusAmount

    const insertResult = await tx.oneOrNone(
      `INSERT INTO crypto_payment_intents (intent_id, user_id, mana_amount, usdc_amount)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (intent_id) DO NOTHING
       RETURNING id`,
      [intentId, userId, finalManaAmount, mexasAmount]
    )

    if (!insertResult) {
      alreadyProcessed = true
      return
    }

    const manaPurchaseTxn = {
      fromId: 'EXTERNAL',
      fromType: 'BANK',
      toId: userId,
      toType: 'USER',
      amount: finalManaAmount,
      token: 'M$',
      category: 'MANA_PURCHASE',
      data: {
        mexasTxHash: txHash,
        payerAddress: normalizedPayer,
        tokenAddress: MEXAS_TOKEN.address,
        chainId: MEXAS_TOKEN.chainId,
        mexasAmount,
        type: 'mexas',
        paidInCents,
        bonusAmount,
        bonusPct,
        isFirstCryptoPurchase,
        isBulkPurchase,
      },
      description: 'Deposit for mana purchase via MEXAS',
    } as const

    await runTxnInBetQueue(tx, manaPurchaseTxn)
    await updateUser(tx, userId, {
      purchasedMana: true,
    })
  })

  if (!alreadyProcessed) {
    log('MEXAS payment processed:', userId, 'M$', finalManaAmount, {
      bonusAmount,
      isFirstCryptoPurchase,
      isBulkPurchase,
      txHash,
      mexasAmount,
    })

    const privateUser = await getPrivateUser(userId)
    if (privateUser) {
      await sendThankYouEmail(user, privateUser)
    }

    await trackPublicEvent(
      userId,
      'M$ purchase',
      {
        amount: finalManaAmount,
        bonusAmount,
        isFirstCryptoPurchase,
        isBulkPurchase,
        mexasAmount,
        txHash,
        paymentType: 'mexas',
      },
      { revenue: mexasAmount }
    )
  }

  return {
    status: alreadyProcessed ? 'already-processed' : 'credited',
    txHash,
    mexasAmount,
    manaAmount: finalManaAmount,
    bonusAmount,
    isFirstCryptoPurchase,
    isBulkPurchase,
  }
}
